export const CLIPBOARD_INTERCEPTOR_SCRIPT = `
  (window).__clipboardContent = '';
  var origWriteText = (navigator.clipboard)?.writeText?.bind(navigator.clipboard);
  if (origWriteText) {
    navigator.clipboard.writeText = async function (text) {
      (window).__clipboardContent = text;
      return origWriteText(text);
    };
  }
  var origWrite = (navigator.clipboard)?.write?.bind(navigator.clipboard);
  if (origWrite) {
    navigator.clipboard.write = async function (items) {
      try {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.types && item.types.includes && item.types.includes('text/plain')) {
            var blob = await item.getType('text/plain');
            var text = await blob.text();
            (window).__clipboardContent = text;
          }
        }
      } catch (_: unknown) { void _; }
      return origWrite(items);
    };
  }
  var origExecCommand = document.execCommand.bind(document);
  document.execCommand = function (command, ui, value) {
    if (command === 'copy') {
      var sel = window.getSelection()?.toString();
      if (sel) (window).__clipboardContent = sel;
    }
    return origExecCommand(command, ui, value);
  };
  document.addEventListener('copy', function () {
    var selection = window.getSelection ? (window.getSelection()?.toString() || '') : '';
    if (selection) {
      (window).__clipboardContent = selection;
    }
  }, true);
  var origFileInputClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') {
      (window).__fileInputClickEvent = {
        accept: this.accept || '',
        multiple: this.multiple || false,
        timestamp: Date.now(),
      };
    }
    return origFileInputClick.apply(this, arguments);
  };
`;
