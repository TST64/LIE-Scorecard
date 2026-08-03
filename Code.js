/**
 * BMAssistent / LIE Scorecard - Backend API
 * Code.js
 * BSD (Allman) Style
 */

function doGet(e) 
{
    try 
    {
        if (!e || !e.parameter || !e.parameter.data)
        {
            return ContentService.createTextOutput("Backend aktiv. API bereit.")
                .setMimeType(ContentService.MimeType.TEXT);
        }

        const body = JSON.parse(e.parameter.data);
        const action = body.action;
        const callback = e.parameter.callback;

        Logger.log("doGet:" + action);
        
        let result;

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
                
            case 'requestTempPin':
                result = requestTempPin(body.spielerId);
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

            case 'softDeleteSpieltagServer':
                result = softDeleteSpieltagServer(body.spieltagId);
                break;
                // In Code.js im Switch-Block ergänzen:
            case 'syncToVault':
                result = syncToVault();
                break;

            case 'savePixelGolfHighscore':
                result = savePixelGolfHighscore(body.spielerName, body.score);
                break;                

            default:
                throw new Error("Unbekannte Action: " + action);
        }

        const jsonResponse = JSON.stringify({ success: true, ...result });

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
    return doGet(e);
}

function doOptions(e) 
{
    return ContentService.createTextOutput("OK")
        .setMimeType(ContentService.MimeType.TEXT);
}

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
            
            if (val instanceof Date) 
            {
                val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
            }
            
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
        const hasValidId = item.id !== undefined && item.id !== null && String(item.id).trim() !== "";
        if (!hasValidId)
        {
            return false;
        }

        return filterCol === null || String(item[filterCol]).trim() === String(filterVal).trim();
    });
}

function clearTestDataBase()
{
    try
    {
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        const tablesToClear = ["app_Spieltage", "app_Flights", "app_ScoreCards"];
        
        tablesToClear.forEach(function(sheetName)
        {
            const sheet = ssApp.getSheetByName(sheetName);
            if (!sheet)
            {
                return;
            }
            
            const lastRow = sheet.getLastRow();
            const lastColumn = sheet.getLastColumn();
            
            if (lastRow > 1)
            {
                const dataRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
                dataRange.clearContent();
            }
        });
        
        SpreadsheetApp.flush();
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function getInitialAppData()
{
    const debugLog = [];
    try
    {
        debugLog.push("Verbinde mit Spreadsheets über Projekteigenschaften...");
        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const ssRef = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssRef"));
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));

        const tSpieler = ssAdmin.getSheetByName("adm_Spieler");
        if (!tSpieler) return { success: false, error: "Tabelle 'adm_Spieler' nicht gefunden!" };

        const tPlaetze = ssRef.getSheetByName("ref_Golfplätze");
        if (!tPlaetze) return { success: false, error: "Tabelle 'ref_Golfplätze' nicht gefunden!" };

        const tKurse = ssRef.getSheetByName("ref_GolfplatzKurse");
        if (!tKurse) return { success: false, error: "Tabelle 'ref_GolfplatzKurse' nicht gefunden!" };

        const tBahnen = ssRef.getSheetByName("ref_KursBahnen");
        if (!tBahnen) return { success: false, error: "Tabelle 'ref_KursBahnen' nicht gefunden!" };

        const tHandicaps = ssRef.getSheetByName("ref_KursHandicap");
        if (!tHandicaps) return { success: false, error: "Tabelle 'ref_KursHandicap' nicht gefunden!" };

        const tSpieltage = ssApp.getSheetByName("app_Spieltage");
        if (!tSpieltage) return { success: false, error: "Tabelle 'app_Spieltage' nicht gefunden!" };

        const tScoreCards = ssApp.getSheetByName("app_ScoreCards");
        if (!tScoreCards) return { success: false, error: "Tabelle 'app_ScoreCards' nicht gefunden!" };

        const tFlights = ssApp.getSheetByName("app_Flights");
        if (!tFlights) return { success: false, error: "Tabelle 'app_Flights' nicht gefunden!" };

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


/**
 * Speichert Live-Scores mit strikter Upsert-Logik (Update or Insert).
 * Verhindert Duplikate in app_ScoreCards vollständig.
 */
function saveLiveScores(scoresArray)
{
    try
    {
        if (!scoresArray || !Array.isArray(scoresArray) || scoresArray.length === 0)
        {
            return { success: true };
        }

        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        const tScores = ssApp.getSheetByName("app_ScoreCards");
        
        if (!tScores)
        {
            return { success: false, error: "Tabelle 'app_ScoreCards' wurde nicht gefunden." };
        }

        // 1. Header sicherstellen, falls das Blatt völlig leer ist
        let lastRow = tScores.getLastRow();
        if (lastRow === 0)
        {
            tScores.appendRow(["id", "spieltagId", "flightSeq", "spielerId", "hole", "strokes", "strokesGiven", "lady", "puts", "maxscore"]);
            lastRow = 1;
        }

        // 2. Bestehende Daten einlesen, um Zeilen-Indizes anhand der 'id' (Spalte 1) zu mappen
        const existingData = tScores.getDataRange().getValues();
        const idToRowMap = {}; // Key: ScoreCard-ID -> Value: Zeilennummer im Sheet (1-basiert)

        for (let i = 1; i < existingData.length; i++)
        {
            const existingId = String(existingData[i][0]).trim();
            if (existingId !== "")
            {
                idToRowMap[existingId] = i + 1; // i=1 ist Zeile 2 im Google Sheet
            }
        }

        const rowsToAppend = [];

        // 3. Durch alle eingehenden Scores iterieren
        scoresArray.forEach(function(item)
        {
            const cleanId = String(item.id).trim();
            
            // 10 Spalten konform zur Tabellenstruktur
            const rowData = [
                cleanId,
                String(item.spieltagId).trim(),
                parseInt(item.flightSeq) || 1,
                String(item.spielerId).trim(),
                parseInt(item.hole),
                parseInt(item.strokes),
                parseInt(item.strokesGiven) || 0,
                item.lady ? "TRUE" : "FALSE",
                parseInt(item.puts) !== undefined ? parseInt(item.puts) : 2,
                item.maxscore ? "TRUE" : "FALSE"
            ];

            if (idToRowMap[cleanId])
            {
                // A) UPDATE: ID existiert bereits -> Bestehende Zeile direkt im Sheet überschreiben
                const existingRowIndex = idToRowMap[cleanId];
                tScores.getRange(existingRowIndex, 1, 1, 10).setValues([rowData]);
            }
            else
            {
                // B) INSERT: Neue ID -> Für Batch-Append am Ende vormerken
                rowsToAppend.push(rowData);
                // ID in Map registrieren, falls im selben Payload Duplikate enthalten sein sollten
                idToRowMap[cleanId] = lastRow + rowsToAppend.length;
            }
        });

        // 4. Neue Einträge gesammelt unten anfügen
        if (rowsToAppend.length > 0)
        {
            const currentLastRow = tScores.getLastRow();
            tScores.getRange(currentLastRow + 1, 1, rowsToAppend.length, 10).setValues(rowsToAppend);
        }

        SpreadsheetApp.flush();
        return { success: true };
    }
    catch (err)
    {
        Logger.log("[saveLiveScores Error] " + err.toString());
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
            spieltagObj.nettoSieger || "",
            "FALSE"
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

        for (let i = 1; i < data.length; i++) 
        {
            if (parseInt(data[i][0]) === cleanId) 
            {
                tPin.getRange(i + 1, 2).setValue(hash);
                tPin.getRange(i + 1, 3).setValue(salt);
                tPin.getRange(i + 1, 4).setValue(timestamp);
                tPin.getRange(i + 1, 5).setValue(flagFirstLogin);
                tPin.getRange(i + 1, 6).setValue(0);
                tPin.getRange(i + 1, 7).setValue("");
                tPin.getRange(i + 1, 8).setValue("");
                SpreadsheetApp.flush();
                return { success: true };
            }
        }

        tPin.appendRow([cleanId, hash, salt, timestamp, flagFirstLogin, 0, "", ""]);
        SpreadsheetApp.flush();
        return { success: true };
    } 
    catch (err) 
    {
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
        let zeileIndex = -1;
        let dbRecord = null;

        for (let i = 1; i < data.length; i++)
        {
            if (parseInt(data[i][0]) === parseInt(spielerId))
            {
                zeileIndex = i + 1;
                dbRecord = {
                    pinHash: String(data[i][1]).trim(),
                    salt: String(data[i][2]).trim(),
                    mustChange: String(data[i][4]).toUpperCase() === "TRUE",
                    failedAttempts: parseInt(data[i][5]) || 0,
                    pendingPinHash: String(data[i][6]).trim(),
                    pendingSalt: String(data[i][7]).trim()
                };
                break;
            }
        }

        if (!dbRecord) 
        {
            const mailResult = requestTempPin(spielerId);
            if (mailResult.success)
            {
                return { success: false, isFirstLoginEmail: true, error: "Ein Bestätigungs-Code wurde an deine hinterlegte E-Mail-Adresse gesendet. Bitte schaue in dein Postfach!" };
            }
            else
            {
                return { success: false, error: mailResult.error };
            }
        }

        const cleanEnteredPin = String(enteredPin).trim();

        if (dbRecord.pendingPinHash && dbRecord.pendingSalt)
        {
            const combinedTemp = cleanEnteredPin + dbRecord.pendingSalt;
            const digestTemp = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combinedTemp, Utilities.Charset.UTF_8);
            const computedTempHash = Utilities.base64Encode(digestTemp);

            if (computedTempHash === dbRecord.pendingPinHash)
            {
                const timestamp = new Date().toString();
                tPin.getRange(zeileIndex, 2).setValue(dbRecord.pendingPinHash);
                tPin.getRange(zeileIndex, 3).setValue(dbRecord.pendingSalt);
                tPin.getRange(zeileIndex, 4).setValue(timestamp);
                tPin.getRange(zeileIndex, 5).setValue(true);
                tPin.getRange(zeileIndex, 6).setValue(0);
                tPin.getRange(zeileIndex, 7).setValue("");
                tPin.getRange(zeileIndex, 8).setValue("");
                SpreadsheetApp.flush();

                return { success: true, mustChange: true };
            }
        }

        if (dbRecord.failedAttempts >= 3)
        {
            return { 
                success: false, 
                locked: true, 
                error: "3-mal falsche PIN eingegeben! Bitte fordere über den Button unten eine neue PIN per E-Mail an." 
            };
        }

        if (dbRecord.pinHash && dbRecord.salt)
        {
            const combinedInput = cleanEnteredPin + dbRecord.salt;
            const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combinedInput, Utilities.Charset.UTF_8);
            const computedHash = Utilities.base64Encode(digest);

            if (computedHash === dbRecord.pinHash) 
            {
                tPin.getRange(zeileIndex, 6).setValue(0);
                SpreadsheetApp.flush();
                return { success: true, mustChange: dbRecord.mustChange };
            }
        }

        const newAttempts = dbRecord.failedAttempts + 1;
        tPin.getRange(zeileIndex, 6).setValue(newAttempts);
        SpreadsheetApp.flush();

        if (newAttempts >= 3)
        {
            return { 
                success: false, 
                locked: true, 
                error: "3-mal falsche PIN eingegeben! Dein Konto wurde gesperrt. Fordere eine neue PIN per E-Mail an." 
            };
        }

        return { 
            success: false, 
            error: `Falsche PIN! (Versuch ${newAttempts} von 3)` 
        };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

function requestTempPin(spielerId)
{
    try
    {
        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const tSpieler = ssAdmin.getSheetByName("adm_Spieler");
        const tPin = ssAdmin.getSheetByName("adm_Pin");

        if (!tSpieler || !tPin)
        {
            return { success: false, error: "Tabellen 'adm_Spieler' oder 'adm_Pin' wurden nicht gefunden." };
        }

        const spielerData = tSpieler.getDataRange().getValues();
        let spielerEmail = "";
        let spielerName = "";

        for (let i = 1; i < spielerData.length; i++)
        {
            if (String(spielerData[i][0]).trim() === String(spielerId).trim())
            {
                spielerName = String(spielerData[i][2] || spielerData[i][1]).trim();
                spielerEmail = String(spielerData[i][3]).trim();
                break;
            }
        }

        if (!spielerEmail || !spielerEmail.includes("@"))
        {
            return { success: false, error: "Für diesen Spieler ist keine gültige E-Mail-Adresse hinterlegt!" };
        }

        const tempPin = Math.floor(100000 + Math.random() * 900000).toString();

        const salt = Utilities.getUuid();
        const combinedInput = tempPin + salt;
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combinedInput, Utilities.Charset.UTF_8);
        const hash = Utilities.base64Encode(digest);

        const pinData = tPin.getDataRange().getValues();
        let zeileIndex = -1;

        for (let j = 1; j < pinData.length; j++)
        {
            if (parseInt(pinData[j][0]) === parseInt(spielerId))
            {
                zeileIndex = j + 1;
                break;
            }
        }

        if (zeileIndex !== -1)
        {
            tPin.getRange(zeileIndex, 7).setValue(hash);
            tPin.getRange(zeileIndex, 8).setValue(salt);
        }
        else
        {
            tPin.appendRow([parseInt(spielerId), "", "", new Date().toString(), true, 0, hash, salt]);
        }

        SpreadsheetApp.flush();

        const subject = "Dein Einmal-Code für die LIE Scorecard";
        const bodyText = `Hallo ${spielerName},\n\ndein Einmal-Code für die Anforderung einer neuen PIN lautet: ${tempPin}\n\nBitte gib diesen Code in der LIE Scorecard App, unter https://www.lochihnein.de ein. Deine bisherige PIN bleibt solange gültig, bis du dich mit diesem Code anmeldest.\n\nSportliche Grüße,\nDein LIE Scorecard Team`;
        
        MailApp.sendEmail(spielerEmail, subject, bodyText);

        return { success: true };
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

function softDeleteSpieltagServer(spieltagId)
{
    try
    {
        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        const tSpieltage = ssApp.getSheetByName("app_Spieltage");
        
        if (!tSpieltage)
        {
            return { success: false, error: "Tabelle 'app_Spieltage' nicht gefunden." };
        }

        const data = tSpieltage.getDataRange().getValues();
        const headers = data[0];
        
        let delColIndex = headers.findIndex(function(h) 
        { 
            return String(h).trim() === "istGeloescht" || String(h).trim() === "istGelöscht"; 
        });

        if (delColIndex === -1)
        {
            return { success: false, error: "Spalte 'istGeloescht' nicht in der Tabelle gefunden!" };
        }

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
            return { success: false, error: "Spieltag nicht gefunden." };
        }

        tSpieltage.getRange(zeile, delColIndex + 1).setValue("TRUE");
        SpreadsheetApp.flush();

        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

/**
 * Einmaliges Bereinigungs-Skript für bestehende Duplikate in app_ScoreCards.
 * Kann manuell im Apps Script Editor gestartet werden.
 */
function cleanupDuplicateScorecards()
{
    Logger.log("=== START DUPLIKAT-BEREINIGUNG ===");
    const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
    const tScores = ssApp.getSheetByName("app_ScoreCards");
    if (!tScores) return;

    const data = tScores.getDataRange().getValues();
    if (data.length <= 1) return;

    const headers = data[0];
    const uniqueMap = {};

    // Von oben nach unten durchgehen: Spätere Eintragszeilen überschreiben frühere
    for (let i = 1; i < data.length; i++)
    {
        const row = data[i];
        const scId = String(row[0]).trim();
        if (scId !== "")
        {
            uniqueMap[scId] = row;
        }
    }

    const cleanRows = [headers];
    Object.keys(uniqueMap).forEach(function(key)
    {
        cleanRows.push(uniqueMap[key]);
    });

    // Tabelle leeren und bereinigte Daten schreiben
    tScores.clearContent();
    tScores.getRange(1, 1, cleanRows.length, headers.length).setValues(cleanRows);
    SpreadsheetApp.flush();
    Logger.log(`=== FERTIG! Tabelle von ${data.length} Zeilen auf ${cleanRows.length} Zeilen bereinigt. ===`);
}

/**
 * Speichert Highscores aus dem Mini-Game 'Pixel Golf Run'
 */
function savePixelGolfHighscore(spielerName, score)
{
    try
    {
        const cleanName = String(spielerName || "Unbekannt").trim();
        const cleanScore = parseInt(score) || 0;

        if (cleanScore <= 0)
        {
            return { success: false, error: "Ungültiger Score" };
        }

        const ssApp = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssApp"));
        let tHighscores = ssApp.getSheetByName("app_PixelRunHighscores");

        // Falls das Blatt noch nicht existiert, automatisch mit dem RICHTIGEN Namen anlegen
        if (!tHighscores)
        {
            tHighscores = ssApp.insertSheet("app_PixelRunHighscores");
            tHighscores.appendRow(["id", "spielerName", "score", "datum", "syncedAt"]);
        }

        const now = new Date();
        const datumStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
        const syncedAtStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
        const newId = "HS-" + Date.now();

        tHighscores.appendRow([
            newId,
            cleanName,
            cleanScore,
            datumStr,
            syncedAtStr
        ]);

        SpreadsheetApp.flush();
        return { success: true, message: "Highscore gespeichert!" };
    }
    catch (err)
    {
        Logger.log("[savePixelGolfHighscore Error] " + err.toString());
        return { success: false, error: err.toString() };
    }
}


