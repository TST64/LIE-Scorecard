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
            obj[header] = row[index];
        });
        return obj;
    });
}