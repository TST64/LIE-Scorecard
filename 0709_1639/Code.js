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
    try
    {
        const ssAdmin = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1PmAhXwOJVVUAMvCNWCaNhmnoUeMM_xiK74mPXh8wi1g/");
        const ssRef = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1vcGyKusm8joOn3Zsp6dgqckH74njN6ydJohK2KB60w0/");
        const ssApp = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1I4ZcnxSGe1Zpr_08SaKa__OMKzLzSrraPgEo4bbmisQ/");

        return {
            success: true,
            spieler: getSheetDataAsJson(ssAdmin.getSheetByName("adm_Spieler")),
            golfplaetze: getSheetDataAsJson(ssRef.getSheetByName("ref_Golfplätze")),
            kurse: getSheetDataAsJson(ssRef.getSheetByName("ref_GolfplatzKurse")),
            bahnen: getSheetDataAsJson(ssRef.getSheetByName("ref_KursBahnen")),
            handicaps: getSheetDataAsJson(ssRef.getSheetByName("ref_KursHandicap")),
            spieltage: getSheetDataAsJson(ssApp.getSheetByName("app_Spieltage"))
        };
    }
    catch (err)
    {
        return {
            success: false,
            error: err.toString()
        };
    }
}

/**
 * Speichert einen neu erstellten Spieltag samt automatisch generierter Flights
 */
function createNewSpieltag(spieltagObj, flightsArray)
{
    try
    {
        const ssApp = SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/1I4ZcnxSGe1Zpr_08SaKa__OMKzLzSrraPgEo4bbmisQ/");
        
        // 1. Spieltag in app_Spieltage eintragen
        const tSpieltage = ssApp.getSheetByName("app_Spieltage");
        tSpieltage.appendRow([
            spieltagObj.id,
            spieltagObj.date,
            spieltagObj.kursId,
            spieltagObj.status,
            spieltagObj.teilnehmerCsv,
            spieltagObj.bruttoSieger || "",
            spieltagObj.nettoSieger || ""
        ]);

        // 2. Flights in app_Flights eintragen
        const tFlights = ssApp.getSheetByName("app_Flights");
        flightsArray.forEach(function(f)
        {
            tFlights.appendRow([
                f.id,
                f.spieltagId,
                f.spielerIdsCsv
            ]);
        });

        return {
            success: true
        };
    }
    catch (err)
    {
        return {
            success: false,
            error: err.toString()
        };
    }
}