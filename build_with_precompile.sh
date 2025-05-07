#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
BUILDER_IMAGE="playwright-sqlite-builder:latest"
APP_IMAGE="playwright-user-sys:latest" # Your final application image tag
PRECOMPILED_DIR="./precompiled"
ARTIFACT_PATH_IN_CONTAINER="/build-artifacts/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
# Directory where production node_modules will be prepared
# IMPORTANT: You need to implement the logic to create this directory correctly.
PROD_MODULES_DIR="./node_modules_prod"

# --- Build Builder Image ---
echo "---> Building SQLite builder image ($BUILDER_IMAGE)..."
docker build -f Dockerfile.builder -t $BUILDER_IMAGE .
echo "---> Builder image built successfully."

# --- Extract Artifact ---
echo "---> Extracting precompiled artifact (better_sqlite3.node)..."
mkdir -p $PRECOMPILED_DIR

# Create a temporary container from the builder image
TEMP_CONTAINER_ID=$(docker create $BUILDER_IMAGE)

# Copy the .node file from the container to the local precompiled directory
if docker cp $TEMP_CONTAINER_ID:$ARTIFACT_PATH_IN_CONTAINER $PRECOMPILED_DIR/better_sqlite3.node; then
  echo "---> Artifact extracted successfully to $PRECOMPILED_DIR"
else
  echo "*** ERROR: Failed to copy artifact from builder container. Path: $ARTIFACT_PATH_IN_CONTAINER" >&2
  docker rm $TEMP_CONTAINER_ID # Clean up even on error
  exit 1
fi

# Remove the temporary container
docker rm $TEMP_CONTAINER_ID

# --- Prepare Production Dependencies ---
# Ensure node_modules exists by running pnpm install first
echo "---> Ensuring node_modules exists by running pnpm install (using --shamefully-hoist)..."
pnpm install --shamefully-hoist
echo "---> pnpm install finished."

# *** Add Debugging ***
echo "---> Debug: Checking for node_modules immediately after install..."
ls -ld node_modules || echo "---> Debug: 'ls -ld node_modules' failed."
echo "---> Debug: Sleeping for 1 second..."
sleep 1
# *** End Debugging ***

echo "---> Preparing production node_modules in $PROD_MODULES_DIR..."
if [ ! -d "node_modules" ]; then
    echo "*** ERROR: 'node_modules' directory not found after pnpm install and sleep." >&2
    exit 1
fi
rm -rf $PROD_MODULES_DIR
# Copy full node_modules to a temporary location for pruning
echo "     Copying full node_modules..."
cp -R node_modules $PROD_MODULES_DIR
echo "     Running pnpm prune --prod in $PROD_MODULES_DIR..."
# Use pnpm prune --prod in the copied directory to remove dev dependencies
# Wrap in subshell to avoid changing current directory
(cd $PROD_MODULES_DIR && pnpm prune --prod)
echo "---> Production node_modules prepared."


# --- Compile TypeScript ---
echo "---> Compiling TypeScript source code (generating ./dist)..."
# Run the build command and capture its exit code explicitly
if pnpm run build; then
    BUILD_EXIT_CODE=$?
    echo "---> TypeScript build command finished with exit code: $BUILD_EXIT_CODE"
else
    BUILD_EXIT_CODE=$?
    echo "*** ERROR: 'pnpm run build' command failed with exit code: $BUILD_EXIT_CODE" >&2
    # Optional: Show last few lines of build output if possible/needed
    exit 1
fi

# Check if the build command actually succeeded (exit code 0)
if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo "*** ERROR: TypeScript build command failed (non-zero exit code)." >&2
    exit 1
fi

# Verify that the dist directory was created *after* the build succeeded
if [ ! -d "dist" ]; then
    echo "*** ERROR: TypeScript compilation succeeded, but the 'dist' directory was not created." >&2
    echo "Please check your build script in package.json to confirm the output directory." >&2
    exit 1
fi
echo "---> TypeScript compiled successfully and 'dist' directory found."


# --- Build Application Image ---
echo "---> Building application image ($APP_IMAGE) using Dockerfile.app..."
# This build context needs access to:
# - Dockerfile.app
# - package.json
# - dist/  (created by 'pnpm run build')
# - src/views/, src/protos/ (needed by COPY in Dockerfile.app)
# - ./precompiled/better_sqlite3.node (created above)
# - ./node_modules_prod (created above)
docker build -f Dockerfile.app -t $APP_IMAGE .
echo "---> Application image built successfully."

# --- Clean up (optional) ---
# echo "---> Cleaning up temporary build directories..."
# rm -rf $PRECOMPILED_DIR
# rm -rf $PROD_MODULES_DIR

echo "
Build process complete. Final image: $APP_IMAGE" 