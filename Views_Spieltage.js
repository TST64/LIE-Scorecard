// =========================================================================
// BMAssistent / LIE Scorecard - Runden & Planungs-Views
// Views_Spieltage.html
// BSD (Allman) Style
// =========================================================================

// Erweiterung des globalen app.views Namespaces für die Spieltage-Liste
app.views.spieltage = function()
{
    let spieltageHtml = `
        <div class="text-center py-8 px-4 bg-stone-50 border border-stone-200 border-dashed rounded-2xl">
            <i class="fas fa-calendar-times text-stone-300 text-3xl mb-2"></i>
            <p class="text-stone-500 text-sm font-medium">Noch keine Spieltage angelegt.</p>
            <p class="text-stone-400 text-[11px] mt-0.5">Klicke oben auf das <i class="fas fa-plus-circle text-stone-500"></i> Plus, um die erste Runde zu starten!</p>
        </div>
    `;
    
    // Filtere "Abgebrochene" Runden aus der Anzeige heraus
    const vanishedRounds = app.state.spieltage ? app.state.spieltage.filter(function(st) 
    { 
        return st && st.status !== 'Abgebrochen'; 
    }) : [];

    const isLeiter = app.state.currentUser && (app.state.currentUser.role === 'Admin' || app.state.currentUser.role === 'Spielleiter');

    if (vanishedRounds.length > 0)
    {
        spieltageHtml = vanishedRounds.map(function(st)
        {
            if (!st || !st.id) 
            {
                return "";
            }

            const rundenKurs = app.state.kurse.find(function(k) 
            { 
                return String(k.id) === String(st.kursId); 
            });
            
            const rundenPlatz = rundenKurs ? app.state.golfplaetze.find(function(p) 
            { 
                return String(p.id) === String(rundenKurs.platzId); 
            }) : null;
            
            const aktStatus = st.status || "Inaktiv";
            const statusColor = aktStatus === 'Aktiv' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-600 border-stone-200';
            
            // NEU: Direkt-Link zur Score-Eingabe für Admins/Spielleiter bei aktiven Runden
            let leiterScoreBtnHtml = "";
            if (aktStatus === 'Aktiv' && isLeiter)
            {
                leiterScoreBtnHtml = `
                    <button onclick="app.router.navigate('score_eingabe', { id: '${st.id}', hole: 1, flightSeq: 1 })" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition flex items-center space-x-1 mr-1.5 shadow-3xs">
                        <i class="fas fa-edit text-[10px]"></i>
                        <span>Scores tippen</span>
                    </button>
                `;
            }

            return `
                <div class="p-4 bg-white border border-stone-200 rounded-xl shadow-2xs space-y-3">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-xs font-semibold text-stone-400">${st.date || ''}</span>
                            <h4 class="font-bold text-stone-800">${rundenPlatz ? rundenPlatz.name : 'Unbekannter Platz'}</h4>
                            <p class="text-xs text-stone-500">${rundenKurs ? rundenKurs.name : ''}</p>
                        </div>
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusColor}">${aktStatus}</span>
                    </div>
                    
                    <div class="pt-1 flex justify-end items-center">
                        ${leiterScoreBtnHtml}
                        <button onclick="app.router.navigate('leaderboard', { id: '${st.id}', mode: 'netto' })" class="px-3 py-1.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 font-bold text-xs rounded-lg transition flex items-center space-x-1">
                            <i class="fas fa-list-ol text-stone-400"></i>
                            <span>${aktStatus === 'Aktiv' ? 'Live-Ranking' : 'Ergebnisse anzeigen'}</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    return `
        <div class="space-y-4">
            <h2 class="text-lg font-bold text-stone-800">Gespielte Runden</h2>
            <div class="space-y-3">
                ${spieltageHtml}
            </div>
        </div>
    `;
};

// View: Neuen Spieltag planen
app.views.spieltag_neu = function()
{
    const kursOptionen = app.state.kurse.map(function(k)
    {
        const platz = app.state.golfplaetze.find(function(p) 
        { 
            return String(p.id) === String(k.platzId); 
        });
        return `<option value="${k.id}">${platz ? platz.name : ''} (${k.name})</option>`;
    }).join('');

    const spielerCheckboxes = app.state.spieler.map(function(s)
    {
        return `
            <label class="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-xl cursor-pointer touch-target select-none transition shadow-2xs">
                <div class="flex items-center space-x-3">
                    <input type="checkbox" name="teilnehmer" value="${s.id}" onchange="app.logic.renderAvailablePlayerChips(); app.logic.renderAllManualFlights();" class="w-5 h-5 accent-emerald-600 rounded border-stone-300">
                    <span class="font-bold text-stone-700 text-sm">${s.name} (${s.nickname})</span>
                </div>
                <span class="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-lg">HCP ${s.hcpOfficial}</span>
            </label>
        `;
    }).join('');

    return `
        <div class="space-y-4">
            <div class="flex items-center space-x-2">
                <button onclick="app.router.navigate('spieltage')" class="text-stone-500 touch-target"><i class="fas fa-arrow-left"></i></button>
                <h2 class="text-lg font-black text-stone-800 tracking-wide">Neue Runde planen</h2>
            </div>

            <div class="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-4">
                <div class="flex flex-col space-y-1">
                    <label class="text-xs font-bold text-stone-400 uppercase tracking-wider">Golfplatz / Kurs</label>
                    <select id="new-spieltag-kurs" class="bg-stone-50 border border-stone-200 rounded-xl px-3 py-3 text-sm focus:border-emerald-600 outline-none font-medium text-stone-700">
                        ${kursOptionen}
                    </select>
                </div>

                <div class="flex flex-col space-y-1">
                    <label class="text-xs font-bold text-stone-400 uppercase tracking-wider">Datum</label>
                    <input type="date" id="new-spieltag-date" value="${new Date().toISOString().split('T')[0]}" class="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:border-emerald-600 outline-none font-medium text-stone-700">
                </div>

                <div class="flex flex-col space-y-2">
                    <label class="text-xs font-bold text-stone-400 uppercase tracking-wider">Wer spielt mit?</label>
                    <div class="space-y-2 max-h-52 overflow-y-auto pr-1">
                        ${spielerCheckboxes}
                    </div>
                </div>

                <div class="flex flex-col space-y-1">
                    <label class="text-xs font-bold text-stone-400 uppercase tracking-wider">Flight-Zusammenstellung</label>
                    <div class="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-xl border border-stone-200">
                        <label class="flex items-center justify-center py-2 text-xs font-bold rounded-lg cursor-pointer select-none has-[:checked]:bg-white has-[:checked]:text-emerald-800 has-[:checked]:shadow-3xs text-stone-500 transition">
                            <input type="radio" name="flight-mode" value="auto" checked onclick="app.logic.toggleFlightMode()" class="hidden"> 
                            <i class="fas fa-dice mr-1"></i> Zufallslosung
                        </label>
                        <label class="flex items-center justify-center py-2 text-xs font-bold rounded-lg cursor-pointer select-none has-[:checked]:bg-white has-[:checked]:text-emerald-800 has-[:checked]:shadow-3xs text-stone-500 transition">
                            <input type="radio" name="flight-mode" value="manual" onclick="app.logic.toggleFlightMode()" class="hidden"> 
                            <i class="fas fa-hand-paper mr-1"></i> Manuell bauen
                        </label>
                    </div>
                </div>

                <!-- Modus A: Zufallslosung -->
                <div id="auto-flight-section" class="space-y-4">
                    <div class="flex flex-col space-y-1">
                        <label class="text-xs font-bold text-stone-400 uppercase tracking-wider">Gewünschte Flight-Größe</label>
                        <div class="grid grid-cols-3 gap-2">
                            <label class="flex items-center justify-center py-2.5 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer text-xs font-semibold text-stone-700">
                                <input type="radio" name="flight-size" value="2" class="mr-1.5 accent-emerald-600"> 2er
                            </label>
                            <label class="flex items-center justify-center py-2.5 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer text-xs font-semibold text-stone-700">
                                <input type="radio" name="flight-size" value="3" class="mr-1.5 accent-emerald-600"> 3er
                            </label>
                            <label class="flex items-center justify-center py-2.5 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer text-xs font-semibold text-stone-700">
                                <input type="radio" name="flight-size" value="4" checked class="mr-1.5 accent-emerald-600"> 4er
                            </label>
                        </div>
                    </div>
                    <button onclick="app.logic.previewFlights()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition text-sm shadow-xs mt-2">
                        <i class="fas fa-dice mr-1"></i> Flights zulosen & Vorschau
                    </button>
                </div>

                <!-- Modus B: Das rekonstruierte manuelle Klick-Interface -->
                <div id="manual-flight-section" class="hidden space-y-4">
                    <div id="manual-flights-builder" class="space-y-3"></div>
                    
                    <button type="button" onclick="app.logic.addEmptyManualFlight()" class="w-full bg-white border border-stone-300 border-dashed hover:bg-stone-50 text-stone-700 text-xs font-bold py-3 rounded-xl transition flex items-center justify-center gap-1 shadow-3xs">
                        <i class="fas fa-plus text-stone-400"></i> Weiteren Flight öffnen
                    </button>

                    <div class="space-y-2 pt-2">
                        <label class="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                            Verfügbare Spieler (Tippen zum Zuweisen in den letzten aktiven Flight):
                        </label>
                        <div id="available-players-chips" class="flex flex-wrap gap-2 p-3 bg-stone-50 border border-stone-200 border-dashed rounded-2xl min-h-12">
                            <!-- Chips werden hier gerendert -->
                        </div>
                    </div>

                    <button onclick="app.logic.saveManualFlights()" class="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3.5 rounded-xl transition text-sm shadow-xs mt-2">
                        <i class="fas fa-check-circle mr-1"></i> Manuelle Flights aktivieren
                    </button>
                </div>
            </div>

            <div id="flight-preview-container" class="hidden space-y-3"></div>
        </div>
    `;
};

