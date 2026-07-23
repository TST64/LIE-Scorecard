
// View: Gruppe & Handicap-Verwaltung
app.views.spieler_liste = function()
{
    const isAdmin = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');

    let spielerListHtml = "";
    
    if (app.state.spieler && app.state.spieler.length > 0)
    {
        spielerListHtml = app.state.spieler.map(function(s) 
        {
            // Wenn der User Admin/Spielleiter ist, bekommt er ein Stift-Icon zum Editieren
            const editActionHtml = isAdmin ? `
                <button onclick="app.router.navigate('spieler_edit', { id: '${s.id}' })" class="text-stone-400 hover:text-emerald-700 p-2 touch-target transition">
                    <i class="fas fa-user-edit text-base"></i>
                </button>
            ` : `
                <div class="text-right">
                    <div class="text-sm font-bold text-emerald-700">HCP: ${s.hcpLIE}</div>
                    <div class="text-[10px] text-stone-400">DGV: ${s.hcpOfficial}</div>
                </div>
            `;

            return `
                <div class="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-xl shadow-2xs">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center uppercase">
                            ${String(s.nickname || s.name).substring(0, 2)}
                        </div>
                        <div>
                            <h4 class="font-semibold text-stone-800">${s.name}</h4>
                            <p class="text-[10px] text-stone-400 font-medium -mt-0.5">@${s.nickname} &bull; ${s.role}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        ${isAdmin ? `<div class="text-right text-xs pr-1"><span class="font-bold text-emerald-700">L:${s.hcpLIE}</span><br><span class="text-stone-400 text-[10px]">D:${s.hcpOfficial}</span></div>` : ''}
                        ${editActionHtml}
                    </div>
                </div>
            `;
        }).join('');
    }
    else
    {
        spielerListHtml = `<p class="text-stone-500 text-sm italic p-2">Keine Spieler geladen.</p>`;
    }

    return `
        <div class="space-y-4">
            <div>
                <h2 class="text-lg font-bold text-stone-800">Die LIE-Gruppe</h2>
                ${isAdmin ? '<p class="text-[11px] text-emerald-700 font-semibold mt-0.5"><i class="fas fa-user-shield"></i> Admin-Modus: Tippe auf das Stift-Icon oder das Plus oben, um Mitglieder zu verwalten.</p>' : ''}
            </div>
            <div class="space-y-2">
                ${spielerListHtml}
            </div>
        </div>
    `;
};
