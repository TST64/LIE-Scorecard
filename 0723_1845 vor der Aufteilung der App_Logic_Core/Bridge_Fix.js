// KORREKTUR in Bridge_Fix.js (Zeile ~4):
if (typeof app !== 'undefined' && app.logic) {
    app.logic.showToast = function(text, type) {
        // Falls App_Logic_Core.js eine globale showToast-Funktion hat:
        if (typeof showToast === 'function') {
            showToast(text, type);
        }
    };
}