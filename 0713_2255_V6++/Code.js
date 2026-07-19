/**
 * Holt eine konfigurierte Tabellen-URL aus den Script-Properties.
 */
function getSpreadsheetUrl(propertyName)
{
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty(propertyName);
    
    if (!url)
    {
        throw new Error("Projekteigenschaft '" + propertyName + "' wurde im Apps Script Projekt nicht gefunden!");
    }
    return url;
}

function doGet(e)
{
    return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .setTitle('LIE Scorecard')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename)
{
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getInitialAppData()
{
    const debugLog = [];
    try
    {
        debugLog.push("Verbinde mit Spreadsheets über Projekteigenschaften...");
        // Dynamischer Abruf statt harter URLs
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

        const rowsToAppend = scoresArray.map(function(item)
        {
            return [
                String(item.id).trim(),
                String(item.spieltagId).trim(),
                parseInt(item.flightSeq) || 1,
                String(item.spielerId).trim(),
                parseInt(item.hole),
                parseInt(item.strokes),
                parseInt(item.strokesGiven) || 0
            ];
        });

        let lastRow = tScores.getLastRow();
        if (lastRow === 0)
        {
            tScores.appendRow(["id", "spieltagId", "flightSeq", "spielerId", "hole", "strokes", "strokesGiven"]);
            lastRow = 1;
        }
        
        tScores.getRange(lastRow + 1, 1, rowsToAppend.length, 7).setValues(rowsToAppend);
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

function setPlayerPin(spielerId, rawPin, isFirstLogin)
{
    try
    {
        const ssAdmin = SpreadsheetApp.openByUrl(getSpreadsheetUrl("ssAdmin"));
        const tSpieler = ssAdmin.getSheetByName("adm_Spieler");
        const spielerData = tSpieler.getDataRange().getValues();

        // === SERVER-SEITIGER CHECK (Nur prüfen, wenn es KEIN neuer Spieler bei der Registrierung ist) ===
        if (rawPin === "4722" && isFirstLogin === false)
        {
            const activeUserEmail = String(Session.getActiveUser().getEmail()).trim().toLowerCase();
            let actingUserRole = "";
            for (let i = 1; i < spielerData.length; i++)
            {
                if (String(spielerData[i][3]).trim().toLowerCase() === activeUserEmail)
                {
                    actingUserRole = String(spielerData[i][7]).trim();
                    break;
                }
            }
            if (actingUserRole !== "Admin")
            {
                return { success: false, error: "Berechtigung verweigert! Nur Administratoren dürfen PINs zurücksetzen." };
            }
        }
        // ==============================================================================================

        const tPin = ssAdmin.getSheetByName("adm_Pin");
        if (!tPin) return { success: false, error: "Tabelle 'adm_Pin' nicht gefunden." };

        const salt = String(Utilities.getUuid()).trim();
        const cleanPin = String(rawPin).trim();
        
        const combinedInput = cleanPin + salt;
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combinedInput, Utilities.Charset.UTF_8);
        const hash = Utilities.base64Encode(digest);
        const timestamp = new Date().toString();
        
        const forceChange = (isFirstLogin !== undefined) ? isFirstLogin : (cleanPin === "4722");

        const data = tPin.getDataRange().getValues();
        let spielerZeile = -1;

        for (let i = 1; i < data.length; i++)
        {
            if (parseInt(data[i][0]) === parseInt(spielerId))
            {
                spielerZeile = i + 1;
                break;
            }
        }

        if (spielerZeile !== -1)
        {
            tPin.getRange(spielerZeile, 2).setValue(hash);
            tPin.getRange(spielerZeile, 3).setValue(salt);
            tPin.getRange(spielerZeile, 4).setValue(timestamp);
            tPin.getRange(spielerZeile, 5).setValue(forceChange ? "TRUE" : "FALSE");
        }
        else
        {
            tPin.appendRow([parseInt(spielerId), hash, salt, timestamp, forceChange ? "TRUE" : "FALSE"]);
        }

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

        const data = tPin.getDataRange().getValues();
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

        if (!dbRecord) return { success: false, error: "Für diesen Spieler wurde noch keine PIN festgelegt." };

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

/**
 * Beendet den Spieltag offiziell, friert die Sieger ein und aktualisiert
 * automatisch die berechneten LIE-Handicaps der Teilnehmer in 'adm_Spieler'.
 */
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

        // 1. Spieltag-Status auf "Beendet" setzen
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

        // 2. Automatische Handicap-Updates in 'adm_Spieler' schreiben
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
                        // Spalte G (Index 7) ist das 'hcpLIE' in der Tabelle
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
        
        // === NEU: SERVER-SEITIGER SICHERHEITS-CHECK ===
        // Wir ermitteln die E-Mail des aktuell angemeldeten Google-Nutzers
        const activeUserEmail = String(Session.getActiveUser().getEmail()).trim().toLowerCase();
        
        // Wir suchen den agierenden Nutzer in der Master-Tabelle
        let actingUserRole = "";
        for (let i = 1; i < data.length; i++)
        {
            if (String(data[i][3]).trim().toLowerCase() === activeUserEmail) // Spalte 4 ist die E-Mail
            {
                actingUserRole = String(data[i][7]).trim(); // Spalte 8 ist die Rolle
                break;
            }
        }
        
        // Wenn der Nutzer kein Admin ist, wird die Aktion rigoros abgelehnt!
        if (actingUserRole !== "Admin")
        {
            return { success: false, error: "Berechtigung verweigert! Nur Administratoren dürfen Spielerprofile anlegen oder bearbeiten." };
        }
        // ==============================================

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

        // === SERVER-SEITIGER CHECK ===
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
        // =============================

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


/**
 * Setzt den Status eines Spieltags im Sheet auf "Abgebrochen".
 */
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

        // Spalte D ist der status (Index 4 -> getRange verlangt Spaltenindex 4)
        tSpieltage.getRange(zeile, 4).setValue("Abgebrochen");
        
        SpreadsheetApp.flush();
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.toString() };
    }
}

/**
 * Holt die konfigurierte Polling-Rate (in Sekunden) aus den Script-Properties.
 * Fallback sind 60 Sekunden, falls nichts hinterlegt ist.
 */
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
    return 60; // Standard-Sicherheitsnetz
}

/**
 * Extrem ressourcenschonender Live-Kanal für das automatische Polling.
 * Lädt ausschließlich die aktuellen Scores des Spieltags.
 */
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
        
        // Filtere nur die Scores, die wirklich zu diesem Spieltag gehören
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

