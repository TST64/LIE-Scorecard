/**
 * Konvertiert jede beliebige Tabelle dynamisch in ein sauberes JSON-Objekt-Array.
 * Repariert zerstörte CSV-Zahlenketten (z.B. 101104102 -> 101,104,102) vollautomatisch beim Laden.
 */
function getSheetDataAsJson(sheet)
{
    if (!sheet)
    {
        return [];
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1)
    {
        return [];
    }

    const headers = data[0];
    const rows = data.slice(1);

    return rows.map(function(row) 
    {
        const obj = {};
        headers.forEach(function(header, index) 
        {
            let val = row[index];
            
            // 1. Datums-Objekte bereinigen
            if (val instanceof Date)
            {
                const year = val.getFullYear();
                const month = String(val.getMonth() + 1).padStart(2, '0');
                const day = String(val.getDate()).padStart(2, '0');
                val = year + "-" + month + "-" + day;
            }
            
            // 2. AUTOMATISCHER RETTUNGSANKER FÜR KOMMALOSE FLIGHT- & TEILNEHMER-LISTEN
            if ((header === "teilnehmerCsv" || header === "spielerIdsCsv") && val !== null && val !== undefined)
            {
                let cleanStr = String(val).trim();
                
                // Wenn Google Sheets die Kommas gefressen hat (String besteht nur aus Zahlen und ist länger als 3 Zeichen)
                if (cleanStr !== "" && !cleanStr.includes(",") && /^\d+$/.test(cleanStr) && cleanStr.length > 3)
                {
                    // Zerlege den String alle 3 Zeichen (für 3-stellige IDs wie 101, 102...)
                    const repairedArray = cleanStr.match(/.{1,3}/g);
                    if (repairedArray)
                    {
                        val = repairedArray.join(",");
                    }
                }
                else
                {
                    val = cleanStr;
                }
            }
            
            obj[header] = val;
        });
        return obj;
    });
}
/**
 * Löscht alle Datensätze aus app_Spieltage, app_Flights und app_ScoreCards.
 * Die Header-Zeilen (Zeile 1) bleiben dabei strikt erhalten.
 * Kann manuell im Editor oder über ein Admin-Menü aufgerufen werden.
 */
function clearTestDataBase()
{
    Logger.log("=== START: DATENBANK-RESET FOR TESTING (CLEAR CONTENT MODE) ===");
    try
    {
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        
        // Liste der zu leerenden Tabellenblätter
        const tablesToClear = ["app_Spieltage", "app_Flights", "app_ScoreCards"];
        
        tablesToClear.forEach(function(sheetName)
        {
            const sheet = ssApp.getSheetByName(sheetName);
            if (!sheet)
            {
                Logger.log(`Hinweis: Blatt '${sheetName}' wurde nicht gefunden.`);
                return;
            }
            
            const lastRow = sheet.getLastRow();
            const lastColumn = sheet.getLastColumn();
            
            // Nur aktiv werden, wenn Daten unter dem Header existieren
            if (lastRow > 1)
            {
                // Wir greifen uns den gesamten Bereich ab Zeile 2 bis zur letzten Zeile/Spalte
                const dataRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
                
                // clearContent löscht alle Daten, lässt aber Formatierungen und Fixierungen absolut intakt
                dataRange.clearContent();
                Logger.log(`Tabelle '${sheetName}': Daten erfolgreich geleert.`);
            }
            else
            {
                Logger.log(`Tabelle '${sheetName}': War bereits leer.`);
            }
        });
        
        // Änderungen sofort in Google Sheets erzwingen
        SpreadsheetApp.flush();
        Logger.log("=== ERFOLG: Datenbank komplett geleert! ===");
        return { success: true };
    }
    catch (err)
    {
        Logger.log("FEHLER beim Zurücksetzen der Datenbank: " + err.toString());
        return { success: false, error: err.toString() };
    }
}




