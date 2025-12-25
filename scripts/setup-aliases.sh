#!/bin/bash

# Setup script to create node_modules symlinks for path aliases
# This allows tsx to resolve @shared/* imports

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_MODULES="$PROJECT_ROOT/node_modules"

# Create symlinks in node_modules for each alias
create_symlink() {
    local alias="$1"
    local target="$2"
    local link_path="$NODE_MODULES/$alias"

    # Remove existing link if it exists
    if [ -L "$link_path" ]; then
        rm "$link_path"
    fi

    # Create the symlink
    if [ ! -e "$link_path" ]; then
        echo "Creating symlink: $alias -> $target"
        ln -sf "$target" "$link_path"
    fi
}

# Read tsconfig.json and create symlinks
if [ -f "$PROJECT_ROOT/tsconfig.json" ]; then
    # Use node to parse JSON
    node -e "
        const fs = require('fs');
        const path = require('path');
        const tsconfig = JSON.parse(fs.readFileSync('$PROJECT_ROOT/tsconfig.json', 'utf8'));
        const paths = tsconfig.compilerOptions?.paths || {};
        const baseUrl = path.resolve('$PROJECT_ROOT', '.');

        for (const [alias, targets] of Object.entries(paths)) {
            if (targets && targets.length > 0) {
                const baseAlias = alias.replace(/\/\*$/, '');
                const targetPath = targets[0].replace(/\/\*$/, '');
                const resolvedPath = path.resolve(baseUrl, targetPath);

                const linkPath = path.join('$NODE_MODULES', baseAlias);

                // Remove existing symlink
                if (fs.existsSync(linkPath)) {
                    const stat = fs.lstatSync(linkPath);
                    if (stat.isSymbolicLink()) {
                        fs.unlinkSync(linkPath);
                    }
                }

                // Create symlink
                if (!fs.existsSync(linkPath)) {
                    console.log('Creating symlink:', baseAlias, '->', resolvedPath);
                    fs.symlinkSync(resolvedPath, linkPath, 'dir');
                }
            }
        }
    "
fi

echo "Path aliases setup complete!"
