' mergeAll.vbs - Fügt alle JS/CSS/HTML-Dateien zu einer .code-Datei zusammen
' Berücksichtigt dabei eine .mergeAll.ignore-Datei mit auszuschließenden Dateien
Option Explicit

Dim fso, currentFolder, file, outputFile, outputPath
Dim fileName, fileExt, fileContent
Dim baseName, codeFileName
Dim ignoreFilePath, ignoreFile, ignoreDict, ignoreEntry

' Dateisystemobjekt erstellen
Set fso = CreateObject("Scripting.FileSystemObject")

' Aktuelles Verzeichnis ermitteln
Set currentFolder = fso.GetFolder(".")

' Basisname für die .code-Datei (aktuelles Verzeichnisname)
baseName = fso.GetBaseName(currentFolder.Path)
codeFileName = baseName & ".code"

' Pfad für die Ausgabedatei
outputPath = currentFolder.Path & "\" & codeFileName

' Ignore-Liste als Dictionary erstellen (für schnelle Suche)
Set ignoreDict = CreateObject("Scripting.Dictionary")

' Ignore-Datei laden
ignoreFilePath = currentFolder.Path & "\.mergeAll.ignore"

' Prüfen, ob die Ignore-Datei existiert
If fso.FileExists(ignoreFilePath) Then
    Set ignoreFile = fso.OpenTextFile(ignoreFilePath, 1) ' 1 = ForReading
    Do Until ignoreFile.AtEndOfStream
        ignoreEntry = Trim(ignoreFile.ReadLine)
        ' Leere Zeilen und Kommentare (mit #) ignorieren
        If ignoreEntry <> "" And Left(ignoreEntry, 1) <> "#" Then
            ignoreDict.Add ignoreEntry, True
        End If
    Loop
    ignoreFile.Close
End If

' Ausgabedatei erstellen
Set outputFile = fso.CreateTextFile(outputPath, True)

' Alle .js, .css, .html-Dateien durchlaufen
For Each file In currentFolder.Files
    fileName = file.Name

    ' Ignorierte Dateien überspringen
    If ignoreDict.Exists(fileName) Then
        ' Datei wird ignoriert - keine weitere Verarbeitung
    Else
        fileExt = fso.GetExtensionName(file.Name)

        ' Nur bestimmte Dateitypen verarbeiten
        If LCase(fileExt) = "js" Or LCase(fileExt) = "css" Or LCase(fileExt) = "html" Then
            outputFile.WriteLine "##### <" & file.Name & ">:"
            outputFile.WriteLine "----------------------------------------------------------------------"

            ' Dateiinhalt einlesen und schreiben
            fileContent = fso.OpenTextFile(file.Path, 1).ReadAll
            outputFile.WriteLine fileContent
            outputFile.WriteLine "" ' Leerzeile für bessere Lesbarkeit
            outputFile.WriteLine ""
        End If
    End If
Next

' Datei schließen
outputFile.Close

WScript.Echo "Alle Dateien wurden erfolgreich in " & codeFileName & " zusammengeführt." & vbCrLf & _
             "Ignorierte Dateien: " & Join(ignoreDict.Keys, ", ")