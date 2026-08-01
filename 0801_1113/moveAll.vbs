' moveAll.vbs - Verschiebt alle Dateien (außer .* und .vbs) in ein neues Verzeichnis
Option Explicit

Dim fso, shell, currentFolder
Dim file, newFolderName, newFolderPath
Dim excludePatterns(2), i
Dim fileName, fileExt

' Dateisystem- und Shell-Objekte erstellen
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Aktuelles Verzeichnis ermitteln
Set currentFolder = fso.GetFolder(".")

' Ausschlussmuster definieren
excludePatterns(0) = ".*"  ' Alle versteckten Dateien
excludePatterns(1) = ".vbs" ' VBS-Skripte
excludePatterns(2) = ".code" ' Code-Dateien

' Neues Verzeichnis mit Datumsformat erstellen
newFolderName = Right("0" & Month(Date), 2) & Right("0" & Day(Date), 2) & "_" & _
                Right("0" & Hour(Time), 2) & Right("0" & Minute(Time), 2)
newFolderPath = currentFolder.Path & "\" & newFolderName

' Verzeichnis erstellen
If Not fso.FolderExists(newFolderPath) Then
    fso.CreateFolder(newFolderPath)
    WScript.Echo "Neues Verzeichnis erstellt: " & newFolderName
End If

' Alle Dateien durchlaufen
For Each file In currentFolder.Files
    fileName = fso.GetBaseName(file.Name)
    fileExt = LCase(fso.GetExtensionName(file.Name))

    ' Prüfen, ob Datei ausgeschlossen werden soll
    Dim excludeFile
    excludeFile = False

    For i = 0 To UBound(excludePatterns)
        If fileExt = excludePatterns(i) Or Left(file.Name, 1) = "." Then
            excludeFile = True
            Exit For
        End If
    Next

    ' Datei verschieben, wenn nicht ausgeschlossen
    If Not excludeFile Then
        file.Move newFolderPath & "\" & file.Name
        WScript.Echo "Verschoben: " & file.Name
    End If
Next

WScript.Echo "Alle Dateien wurden erfolgreich verschoben."