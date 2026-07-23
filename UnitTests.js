function UT_verifyPlayerPin()
{
  var result = verifyPlayerPin(101, "4722");
  var a = "b";
}

function UT_diagnoseAndWritePins()
{
    Logger.log("=== START DIAGNOSE-SCHREIBEN ===");
    try
    {
        const url = "https://docs.google.com/spreadsheets/d/1PmAhXwOJVVUAMvCNWCaNhmnoUeMM_xiK74mPXh8wi1g/";
        Logger.log("Öffne Spreadsheet über URL...");
        const ssAdmin = SpreadsheetApp.openByUrl(url);
        
        Logger.log("Suche Tabellenblatt 'adm_Pin'...");
        const tPin = ssAdmin.getSheetByName("adm_Pin");
        
        if (!tPin)
        {
            Logger.log("FEHLER: Tabellenblatt 'adm_Pin' wurde NICHT gefunden!");
            // Zeige alle verfügbaren Blätter an, um Tippfehler (z.B. Leerzeichen) zu sehen
            const sheets = ssAdmin.getSheets();
            sheets.forEach(function(s) {
                Logger.log("Verfügbares Blatt im Sheet: '" + s.getName() + "'");
            });
            return;
        }
        
        Logger.log("Tabellenblatt 'adm_Pin' erfolgreich gefunden.");
        Logger.log("Aktuelle Zeilenanzahl vor dem Schreiben: " + tPin.getLastRow());

        // Testdaten für stocki (101) vorbereiten
        const spielerId = 101;
        const salt = "TEST-SALT-UUID-1234";
        const hash = "TEST-HASH-VALUE-5678";
        const timestamp = new Date().toString();

        Logger.log("Versuche Zeile anzuhängen via appendRow...");
        tPin.appendRow([
            spielerId,
            hash,
            salt,
            timestamp
        ]);
        
        Logger.log("Zeilenanzahl NACH appendRow: " + tPin.getLastRow());
        
        // Sicherheits-Flush: Zwingt Google Sheets, alle anstehenden Änderungen sofort zu schreiben
        SpreadsheetApp.flush();
        Logger.log("SpreadsheetApp.flush() ausgeführt.");
        Logger.log("=== DIAGNOSE BEENDET ===");
    }
    catch (err)
    {
        Logger.log("KRITISCHER FEHLER IM TESTLAUF: " + err.toString());
    }
}

function UT_requestTempPin()
{
  let a = requestTempPin(101);
}

