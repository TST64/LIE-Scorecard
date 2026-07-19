' mergeAll.vbs - Fügt alle JS/CSS/HTML-Dateien zu einer .code-Datei zusammen
Option Explicit

Dim fso, currentFolder, file, outputFile, outputPath
Dim fileName, fileExt, fileContent
Dim baseName, codeFileName

' Dateisystemobjekt erstellen
Set fso = CreateObject("Scripting.FileSystemObject")

' Aktuelles Verzeichnis ermitteln
Set currentFolder = fso.GetFolder(".")

' Basisname für die .code-Datei (aktuelles Verzeichnisname)
baseName = fso.GetBaseName(currentFolder.Path)
codeFileName = baseName & ".code"

' Pfad für die Ausgabedatei
outputPath = currentFolder.Path & "\" & codeFileName

' Ausgabedatei erstellen
Set outputFile = fso.CreateTextFile(outputPath, True)

' Alle .js, .css, .html-Dateien durchlaufen
For Each file In currentFolder.Files
    fileName = fso.GetBaseName(file.Name)
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
Next

' Datei schließen
outputFile.Close

WScript.Echo "Alle Dateien wurden erfolgreich in " & codeFileName & " zusammengeführt."