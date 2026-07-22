/**
 * BMAssistent / LIE Scorecard - Backend API
 * Code.js
 * BSD (Allman) Style
 */

function doGet(e) 
{
    try 
    {
        // Prüfen, ob Daten da sind
        if (!e || !e.parameter || !e.parameter.data)
        {
            return ContentService.createTextOutput("Backend aktiv. API bereit.")
                .setMimeType(ContentService.MimeType.TEXT);
        }

        // 1. JSON-Payload aus dem GET-Parameter "data" parsen
        const body = JSON.parse(e.parameter.data);
        const action = body.action;
        const callback = e.parameter.callback;
        
        let result;

        // 2. Routing: Welche Funktion soll ausgeführt werden?
        switch (action) 
        {
            case 'getInitialAppData':
                result = getInitialAppData();
                break;
                
            case 'saveLiveScores':
                result = saveLiveScores(body.payload || body);
                break;

            case 'verifyPlayerPin':
                result = verifyPlayerPin(body.spielerId, body.pin);
                break;
                
            case 'changePlayerPinServer':
                result = changePlayerPinServer(body.spielerId, body.newPin);
                break;
                
            case 'savePlayerServer':
                result = savePlayerServer(body);
                break;

            case 'deletePlayerServer':
                result = deletePlayerServer(body.spielerId);
                break;

            case 'setPlayerPin':
                result = setPlayerPin(body.spielerId, body.pin, body.mustChange);
                break;
                
            case 'clearTestDataBase':
                result = clearTestDataBase();
                break;
                
            case 'cancelSpieltagServer':
                result = cancelSpieltagServer(body.spieltagId);
                break;
                
            case 'closeSpieltagServer':
                result = closeSpieltagServer(body.spieltagId, body.bruttoSieger, body.nettoSieger, body.handicapUpdates);
                break;
                
            case 'createNewSpieltag':
                result = createNewSpieltag(body.spieltagObj, body.flightsPayload);
                break;
                
            case 'getLiveScoreUpdates':
                result = getLiveScoreUpdates(body.spieltagId);
                break;

            default:
                throw new Error("Unbekannte Action: " + action);
        }

        const jsonResponse = JSON.stringify({ success: true, ...result });

        // Wenn ein Callback mitgeliefert wurde, antworten wir im JSONP-Format
        if (callback)
        {
            return ContentService.createTextOutput(callback + "(" + jsonResponse + ")")
                .setMimeType(ContentService.MimeType.JAVASCRIPT);
        }

        return ContentService.createTextOutput(jsonResponse)
            .setMimeType(ContentService.MimeType.JSON);
    } 
    catch (err) 
    {
        const errorResponse = JSON.stringify({ success: false, error: err.message });
        
        if (e && e.parameter && e.parameter.callback)
        {
            return ContentService.createTextOutput(e.parameter.callback + "(" + errorResponse + ")")
                .setMimeType(ContentService.MimeType.JAVASCRIPT);
        }

        return ContentService.createTextOutput(errorResponse)
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function doPost(e) 
{
    // Weiterleitung an doGet, falls doch mal ein POST reinkommt
    return doGet(e);
}

function doOptions(e) 
{
    return ContentService.createTextOutput("OK")
        .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Konvertiert eine Tabelle in JSON, optional gefiltert nach einer Spalte und einem Wert.
 * Inklusive Datums-Bereinigung und CSV-Rettungsanker.
 */
function getSheetDataAsJson(sheet, filterCol = null, filterVal = null)
{
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const headers = data[0];
    const rows = data.slice(1);

    return rows.map(function(row) 
    {
        const obj = {};
        headers.forEach(function(header, index) 
        {
            let val = row[index];
            
            // Datums-Bereinigung
            if (val instanceof Date) 
            {
                val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
            }
            
            // CSV-Rettungsanker
            if ((header === "teilnehmerCsv" || header === "spielerIdsCsv") && val) 
            {
                let cleanStr = String(val).trim();
                if (cleanStr !== "" && !cleanStr.includes(",") && /^\d+$/.test(cleanStr) && cleanStr.length > 3) 
                {
                    val = cleanStr.match(/.{1,3}/g).join(",");
                } 
                else 
                {
                    val = cleanStr;
                }
            }
            obj[header] = val;
        });
        return obj;
    }).filter(function(item) 
    {
        return filterCol === null || String(item[filterCol]).trim() === String(filterVal).trim();
    });
}

/**
 * Löscht alle Datensätze aus app_Spieltage, app_Flights und app_ScoreCards.
 * Die Header-Zeilen (Zeile 1) bleiben dabei strikt erhalten.
 */
function clearTestDataBase()
{
    Logger.log("=== START: DATENBANK-RESET FOR TESTING (CLEAR CONTENT MODE) ===");
    try
    {
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
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
            
            if (lastRow > 1)
            {
                const dataRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
                dataRange.clearContent();
                Logger.log(`Tabelle '${sheetName}': Daten erfolgreich geleert.`);
            }
            else
            {
                Logger.log(`Tabelle '${sheetName}': War bereits leer.`);
            }
        });
        
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

// ==========================================
// CORE API-FUNKTIONEN
// ==========================================

function getInitialAppData()
{
    const debugLog = [];
    try
    {
        debugLog.push("Verbinde mit Spreadsheets über Projekteigenschaften...");
        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const ssRef = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssRef"));
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));

        debugLog.push("Suche Tabellenblatt 'adm_Spieler'...");
        const tSpieler = ssAdmin.getSheetByName("adm_Spieler");
        if (!tSpieler) return { success: false, error: "Tabelle 'adm_Spieler' nicht gefunden!" };

        debugLog.push("Suche Tabellenblatt 'ref_Golfplätze'...");
        const tPlaetze = ssRef.getSheetByName("ref_Golfplätze");
        if (!tPlaetze) return { success: false, error: "Tabelle 'ref_Golfplätze' nicht gefunden!" };

        debugLog.push("Suche Tabellenblatt 'ref_GolfplatzKurse'...");
        const tKurse = ssRef.getSheetByName("ref_GolfplatzKurse");
        if (!tKurse) return { success: false, error: "Tabelle 'ref_GolfplatzKurse' nicht gefunden!" };

        debugLog.push("Suche Tabellenblatt 'ref_KursBahnen'...");
        const tBahnen = ssRef.getSheetByName("ref_KursBahnen");
        if (!tBahnen) return { success: false, error: "Tabelle 'ref_KursBahnen' nicht gefunden!" };

        debugLog.push("Suche Tabellenblatt 'ref_KursHandicap'...");
        const tHandicaps = ssRef.getSheetByName("ref_KursHandicap");
        if (!tHandicaps) return { success: false, error: "Tabelle 'ref_KursHandicap' nicht gefunden!" };

        debugLog.push("Suche Tabellenblatt 'app_Spieltage'...");
        const tSpieltage = ssApp.getSheetByName("app_Spieltage");
        if (!tSpieltage) return { success: false, error: "Tabelle 'app_Spieltage' nicht gefunden!" };

        debugLog.push("Suche Tabellenblatt 'app_ScoreCards'...");
        const tScoreCards = ssApp.getSheetByName("app_ScoreCards");
        if (!tScoreCards) return { success: false, error: "Tabelle 'app_ScoreCards' nicht gefunden!" };

        debugLog.push("Suche Tabellenblatt 'app_Flights'...");
        const tFlights = ssApp.getSheetByName("app_Flights");
        if (!tFlights) return { success: false, error: "Tabelle 'app_Flights' nicht gefunden!" };

        debugLog.push("Konvertiere Tabellendaten...");
        return {
            success: true,
            spieler: getSheetDataAsJson(tSpieler),
            golfplaetze: getSheetDataAsJson(tPlaetze),
            kurse: getSheetDataAsJson(tKurse),
            bahnen: getSheetDataAsJson(tBahnen),
            handicaps: getSheetDataAsJson(tHandicaps),
            spieltage: getSheetDataAsJson(tSpieltage),
            scoreCards: getSheetDataAsJson(tScoreCards),
            flights: getSheetDataAsJson(tFlights)
        };
    }
    catch (err)
    {
        return {
            success: false,
            error: "Kritischer Abbruch bei Schritt: " + debugLog.pop() + "\n\nDetails: " + err.toString()
        };
    }
}

function saveLiveScores(scoresArray)
{
    try
    {
        if (!scoresArray || scoresArray.length === 0)
        {
            return { success: true };
        }

        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        const tScores = ssApp.getSheetByName("app_ScoreCards");
        
        if (!tScores)
        {
            return { success: false, error: "Tabelle 'app_ScoreCards' wurde nicht gefunden." };
        }

        // Mappt jetzt alle 9 Spalten inklusive lady und puts auf das Sheet-Format
        const rowsToAppend = scoresArray.map(function(item)
        {
            return [
                String(item.id).trim(),
                String(item.spieltagId).trim(),
                parseInt(item.flightSeq) || 1,
                String(item.spielerId).trim(),
                parseInt(item.hole),
                parseInt(item.strokes),
                parseInt(item.strokesGiven) || 0,
                item.lady ? "TRUE" : "FALSE",
                parseInt(item.puts) !== undefined ? parseInt(item.puts) : 2
            ];
        });

        let lastRow = tScores.getLastRow();
        if (lastRow === 0)
        {
            tScores.appendRow(["id", "spieltagId", "flightSeq", "spielerId", "hole", "strokes", "strokesGiven", "lady", "puts"]);
            lastRow = 1;
        }
        
        // Bereich erweitert auf 9 Spalten Breite
        tScores.getRange(lastRow + 1, 1, rowsToAppend.length, 9).setValues(rowsToAppend);
        SpreadsheetApp.flush();

        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function createNewSpieltag(spieltagObj, flightsArray)
{
    try
    {
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        const tSpieltage = ssApp.getSheetByName("app_Spieltage");
        
        tSpieltage.appendRow([
            spieltagObj.id,
            spieltagObj.date,
            spieltagObj.kursId,
            spieltagObj.status,
            "'" + String(spieltagObj.teilnehmerCsv),
            spieltagObj.bruttoSieger || "",
            spieltagObj.nettoSieger || ""
        ]);

        const tFlights = ssApp.getSheetByName("app_Flights");
        flightsArray.forEach(function(f)
        {
            tFlights.appendRow([
                f.id,
                f.spieltagId,
                "'" + String(f.spielerIdsCsv)
            ]);
        });

        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function updatePlayerHandicap(spielerId, newHcpOfficial, newHcpLie)
{
    try
    {
        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const tSpieler = ssAdmin.getSheetByName("adm_Spieler");
        
        const data = tSpieler.getDataRange().getValues();
        let zeile = -1;

        for (let i = 1; i < data.length; i++)
        {
            if (parseInt(data[i][0]) === parseInt(spielerId))
            {
                zeile = i + 1;
                break;
            }
        }

        if (zeile === -1)
        {
            return { success: false, error: "Spieler nicht in der Datenbank gefunden." };
        }

        tSpieler.getRange(zeile, 6).setValue(parseFloat(newHcpOfficial));
        tSpieler.getRange(zeile, 7).setValue(parseInt(newHcpLie));
        
        SpreadsheetApp.flush();
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function setPlayerPin(spielerId, newPin, isFirstLogin) 
{
    try 
    {
        // Validierung der ID, damit niemals wieder #NUM! reingeschrieben wird
        const cleanId = parseInt(spielerId);
        if (isNaN(cleanId) || cleanId <= 0) {
            throw new Error("Ungültige Spieler-ID übergeben: " + spielerId);
        }

        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const tPin = ssAdmin.getSheetByName("adm_Pin");
        if (!tPin) return { success: false, error: "Tabelle 'adm_Pin' nicht gefunden." };

        const data = tPin.getDataRange().getValues();
        const salt = Utilities.getUuid();
        const combinedInput = String(newPin).trim() + salt;
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combinedInput, Utilities.Charset.UTF_8);
        const hash = Utilities.base64Encode(digest);
        
        const timestamp = new Date().toString();
        const flagFirstLogin = isFirstLogin ? true : false;

        // Suchen, ob der Spieler schon existiert (um ID-Duplikate zu vermeiden)
        for (let i = 1; i < data.length; i++) 
        {
            if (parseInt(data[i][0]) === cleanId) 
            {
                // Aktualisieren statt neu anlegen
                tPin.getRange(i + 1, 2).setValue(hash);
                tPin.getRange(i + 1, 3).setValue(salt);
                tPin.getRange(i + 1, 4).setValue(timestamp);
                tPin.getRange(i + 1, 5).setValue(flagFirstLogin);
                return { success: true };
            }
        }

        // Falls er nicht existiert: Sauber als neue Zeile anhängen
        tPin.appendRow([cleanId, hash, salt, timestamp, flagFirstLogin]);
        return { success: true };
    } 
    catch (err) 
    {
        Logger.log("[setPlayerPin Error] " + err.toString());
        return { success: false, error: err.toString() };
    }
}

function verifyPlayerPin(spielerId, enteredPin)
{
    try
    {
        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const tPin = ssAdmin.getSheetByName("adm_Pin");
        
        if (!tPin) return { success: false, error: "Sicherheits-Tabelle 'adm_Pin' wurde nicht gefunden." };

        let data = tPin.getDataRange().getValues();
        let dbRecord = null;

        for (let i = 1; i < data.length; i++)
        {
            if (parseInt(data[i][0]) === parseInt(spielerId))
            {
                dbRecord = {
                    hash: String(data[i][1]).trim(),
                    salt: String(data[i][2]).trim(),
                    mustChange: String(data[i][4]).toUpperCase() === "TRUE"
                };
                break;
            }
        }

        // Rettungsanker ohne Selbstaufruf: Direkt hier anlegen und verarbeiten
        if (!dbRecord) 
        {
            Logger.log(`[PIN Guard] Keine PIN für Spieler ID ${spielerId} gefunden. Erzeuge Standard-PIN 4722...`);
            setPlayerPin(spielerId, "4722", true);
            
            // Wenn die eingegebene PIN die 4722 ist, lassen wir ihn sofort durch zum Ändern
            if (String(enteredPin).trim() === "4722")
            {
                return { success: true, mustChange: true };
            }
            else
            {
                return { success: false, error: "Initial-PIN generiert. Bitte verwende '4722' für den ersten Login." };
            }
        }

        const cleanEnteredPin = String(enteredPin).trim();
        const combinedInput = cleanEnteredPin + dbRecord.salt;
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combinedInput, Utilities.Charset.UTF_8);
        const computedHash = Utilities.base64Encode(digest);

        if (computedHash === dbRecord.hash) 
        {
            return { success: true, mustChange: dbRecord.mustChange };
        }
        else 
        {
            return { success: false, error: "Falsche PIN! Bitte versuche es erneut." };
        }
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function changePlayerPinServer(spielerId, newPin)
{
    return setPlayerPin(spielerId, newPin, false);
}

function closeSpieltagServer(spieltagId, bruttoSieger, nettoSieger, handicapUpdatesArray)
{
    try
    {
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        const tSpieltage = ssApp.getSheetByName("app_Spieltage");
        
        if (!tSpieltage)
        {
            return { success: false, error: "Tabelle 'app_Spieltage' wurde nicht gefunden." };
        }

        const dataSpieltage = tSpieltage.getDataRange().getValues();
        let zeileSpieltag = -1;

        for (let i = 1; i < dataSpieltage.length; i++)
        {
            if (String(dataSpieltage[i][0]).trim() === String(spieltagId).trim())
            {
                zeileSpieltag = i + 1;
                break;
            }
        }

        if (zeileSpieltag === -1)
        {
            return { success: false, error: "Spieltag nicht in der Datenbank gefunden." };
        }

        tSpieltage.getRange(zeileSpieltag, 4).setValue("Beendet");
        tSpieltage.getRange(zeileSpieltag, 6).setValue(bruttoSieger);
        tSpieltage.getRange(zeileSpieltag, 7).setValue(nettoSieger);

        if (handicapUpdatesArray && handicapUpdatesArray.length > 0)
        {
            const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
            const tSpieler = ssAdmin.getSheetByName("adm_Spieler");
            if (tSpieler)
            {
                const dataSpieler = tSpieler.getDataRange().getValues();
                
                handicapUpdatesArray.forEach(function(update)
                {
                    let zeileSpieler = -1;
                    for (let j = 1; j < dataSpieler.length; j++)
                    {
                        if (String(dataSpieler[j][0]).trim() === String(update.spielerId).trim())
                        {
                            zeileSpieler = j + 1;
                            break;
                        }
                    }

                    if (zeileSpieler !== -1)
                    {
                        tSpieler.getRange(zeileSpieler, 7).setValue(parseInt(update.newHcpLie));
                    }
                });
            }
        }
        
        SpreadsheetApp.flush();
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function savePlayerServer(spielerObj)
{
    try
    {
        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const tSpieler = ssAdmin.getSheetByName("adm_Spieler");
        
        if (!tSpieler)
        {
            return { success: false, error: "Tabelle 'adm_Spieler' nicht gefunden." };
        }

        const data = tSpieler.getDataRange().getValues();
        const activeUserEmail = String(Session.getActiveUser().getEmail()).trim().toLowerCase();
        
        let actingUserRole = "";
        for (let i = 1; i < data.length; i++)
        {
            if (String(data[i][3]).trim().toLowerCase() === activeUserEmail)
            {
                actingUserRole = String(data[i][7]).trim();
                break;
            }
        }
        
        if (actingUserRole !== "Admin")
        {
            return { success: false, error: "Berechtigung verweigert! Nur Administratoren dürfen Spielerprofile anlegen oder bearbeiten." };
        }

        let zeile = -1;
        for (let i = 1; i < data.length; i++)
        {
            if (String(data[i][0]).trim() === String(spielerObj.id).trim())
            {
                zeile = i + 1;
                break;
            }
        }

        if (spielerObj.isNew && zeile !== -1)
        {
            return { success: false, error: "Ein Spieler mit dieser ID existiert bereits!" };
        }

        const rowData = [
            spielerObj.id,
            spielerObj.name,
            spielerObj.nickname,
            spielerObj.email,
            spielerObj.teeColor,
            parseFloat(spielerObj.hcpOfficial) || 54.0,
            parseInt(spielerObj.hcpLIE) || 54,
            spielerObj.role
        ];

        if (zeile !== -1)
        {
            tSpieler.getRange(zeile, 1, 1, 8).setValues([rowData]);
        }
        else
        {
            tSpieler.appendRow(rowData);
            setPlayerPin(spielerObj.id, "4722", true);
        }

        SpreadsheetApp.flush();
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function deletePlayerServer(spielerId)
{
    try
    {
        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const tSpieler = ssAdmin.getSheetByName("adm_Spieler");
        const data = tSpieler.getDataRange().getValues();

        const activeUserEmail = String(Session.getActiveUser().getEmail()).trim().toLowerCase();
        let actingUserRole = "";
        for (let i = 1; i < data.length; i++)
        {
            if (String(data[i][3]).trim().toLowerCase() === activeUserEmail)
            {
                actingUserRole = String(data[i][7]).trim();
                break;
            }
        }
        if (actingUserRole !== "Admin")
        {
            return { success: false, error: "Berechtigung verweigert! Nur Administratoren dürfen Spieler löschen." };
        }

        let zeile = -1;
        for (let i = 1; i < data.length; i++)
        {
            if (String(data[i][0]).trim() === String(spielerId).trim())
            {
                zeile = i + 1;
                break;
            }
        }

        if (zeile === -1)
        {
            return { success: false, error: "Spieler nicht in der Datenbank gefunden." };
        }

        tSpieler.deleteRow(zeile);
        
        const tPin = ssAdmin.getSheetByName("adm_Pin");
        if (tPin)
        {
            const pinData = tPin.getDataRange().getValues();
            for (let j = 1; j < pinData.length; j++)
            {
                if (String(pinData[j][0]).trim() === String(spielerId).trim())
                {
                    tPin.deleteRow(j + 1);
                    break;
                }
            }
        }

        SpreadsheetApp.flush();
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function cancelSpieltagServer(spieltagId)
{
    try
    {
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        const tSpieltage = ssApp.getSheetByName("app_Spieltage");
        
        if (!tSpieltage)
        {
            return { success: false, error: "Tabelle 'app_Spieltage' wurde nicht gefunden." };
        }

        const data = tSpieltage.getDataRange().getValues();
        let zeile = -1;

        for (let i = 1; i < data.length; i++)
        {
            if (String(data[i][0]).trim() === String(spieltagId).trim())
            {
                zeile = i + 1;
                break;
            }
        }

        if (zeile === -1)
        {
            return { success: false, error: "Spieltag nicht in der Datenbank gefunden." };
        }

        tSpieltage.getRange(zeile, 4).setValue("Abgebrochen");
        SpreadsheetApp.flush();
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function getLiveScoreUpdates(spieltagId)
{
    try
    {
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        const tScoreCards = ssApp.getSheetByName("app_ScoreCards");
        
        if (!tScoreCards)
        {
            return { success: false, error: "Tabelle 'app_ScoreCards' nicht gefunden." };
        }

        const allScores = getSheetDataAsJson(tScoreCards);
        const filteredScores = allScores.filter(function(sc)
        {
            return String(sc.spieltagId).trim() === String(spieltagId).trim();
        });

        const currentRate = getPollingRateProperty();

        return {
            success: true,
            scoreCards: filteredScores,
            pollingRate: currentRate
        };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

// ==========================================
// GLOBALE HILFSFUNKTIONEN (OHNE DUPLIKATE)
// ==========================================

function getSpreadsheetUrl(key)
{
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty(key);
    if (!url) 
    {
        throw new Error("Die Skripteigenschaft '" + key + "' (Spreadsheet-URL) ist nicht konfiguriert!");
    }
    return url;
}

function getPollingRateProperty()
{
    try
    {
        const props = PropertiesService.getScriptProperties();
        const rate = props.getProperty("pollingRate");
        if (rate)
        {
            return parseInt(rate);
        }
    }
    catch (err)
    {
        Logger.log("Fehler beim Lesen der pollingRate Eigenschaft: " + err.toString());
    }
    return 60; 
}