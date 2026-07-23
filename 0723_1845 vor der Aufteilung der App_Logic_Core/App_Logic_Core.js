// =========================================================================
// BMAssistent / LIE Scorecard - Anwendungslogik
// App_Logic_Core.js
// BSD (Allman) Style
// =========================================================================

/**
 * BRIDGE-LAYER
 * Leitet alle alten 'google.script.run' Aufrufe auf das neue API-Gateway um.
 */
window.google = window.google || {};
window.google.script = {
    run: {
        withSuccessHandler: function(cb) { this.successCb = cb; return this; },
        withFailureHandler: function(cb) { this.failureCb = cb; return this; },
        __call: function(action, args) {
            console.log(`[BRIDGE] Weiterleitung an API: ${action}`);
            const payload = args.length > 0 ? args[0] : {};
            
            app.logic.apiRequest(action, payload).then(res => {
                if (res.success) { 
                    if (this.successCb) this.successCb(res); 
                } else { 
                    console.error(`[BRIDGE Error] ${action}:`, res.error);
                    if (this.failureCb) this.failureCb(res.error); 
                }
            });
            return this;
        }
    }
};

// Proxy für google.script.run
google.script.run = new Proxy(google.script.run, {
    get: function(target, prop) {
        if (prop === 'withSuccessHandler' || prop === 'withFailureHandler' || prop === 'successCb' || prop === 'failureCb') return target[prop];
        return function(...args) { return target.__call(prop, args); };
    }
});


// =========================================================================
// KONSOLIDIERTE ANWENDUNGSLOGIK (app.logic)
// =========================================================================
app.logic = 
{
    // API Interface via JSONP
    apiRequest: function(action, payload = {})
    {
        console.log(`[API Request] Action: ${action}`);

        return new Promise((resolve, reject) => 
        {
            if (typeof CONFIG === "undefined" || !CONFIG.API_URL) 
            {
                console.error("[API Error] CONFIG oder CONFIG.API_URL ist nicht definiert!");
                app.logic.showToast("Konfigurationsfehler: API_URL fehlt", "error");
                return resolve({ success: false, error: "CONFIG fehlt" });
            }

            const callbackName = "gas_callback_" + Math.random().toString(36).substring(2, 15);
            
            window[callbackName] = function(data) 
            {
                document.body.removeChild(script);
                delete window[callbackName];
                resolve(data);
            };

            const dataPayload = JSON.stringify({ action: action, ...payload });
            const finalUrl = `${CONFIG.API_URL}?callback=${callbackName}&data=${encodeURIComponent(dataPayload)}`;

            const script = document.createElement("script");
            script.src = finalUrl;
            script.onerror = function() 
            {
                document.body.removeChild(script);
                delete window[callbackName];
                console.error("[API Error] JSONP-Request fehlgeschlagen.");
                app.logic.showToast("Server-Verbindungsfehler", "error");
                resolve({ success: false, error: "Verbindungsfehler" });
            };

            document.body.appendChild(script);
        });
    },

    // Globaler Daten-Refresh
    refreshGlobalAppData: async function()
    {
        const icon = document.getElementById('global-refresh-icon');
        const btn = document.getElementById('global-refresh-btn');
        
        if (btn && icon)
        {
            btn.disabled = true;
            icon.classList.add('fa-spin');
        }

        try 
        {
            const response = await app.logic.apiRequest('getInitialAppData');
            if (response && response.success === true)
            {
                app.state.spieler = response.spieler || [];
                app.state.golfplaetze = response.golfplaetze || [];
                app.state.kurse = response.kurse || [];
                app.state.bahnen = response.bahnen || [];
                app.state.handicaps = response.handicaps || [];
                app.state.spieltage = response.spieltage || [];
                app.state.scoreCards = response.scoreCards || [];
                app.state.flights = response.flights || [];

                if (app.state.currentUser)
                {
                    const freshUserMatch = app.state.spieler.find(function(s) 
                    { 
                        return String(s.id).trim() === String(app.state.currentUser.id).trim(); 
                    });
                    
                    if (freshUserMatch)
                    {
                        app.state.currentUser = freshUserMatch;
                    }
                }

                app.router.updateNavigationUI(app.state.currentView);
                app.logic.updateHeaderRoleIcon();
                app.router.navigate(app.state.currentView);
            }
        } 
        catch (err) 
        {
            console.error("Fehler beim Hintergrund-Refresh:", err);
            app.logic.showToast("Daten konnten nicht aktualisiert werden. Offline?", "error");
        }
        finally 
        {
            setTimeout(function()
            {
                if (btn && icon)
                {
                    btn.disabled = false;
                    icon.classList.remove('fa-spin');
                }
            }, 500);
        }
    },

    calculateHoleVorgabe: function(spieler, kursId, holeSi)
    {
        const hcp = parseFloat(spieler ? spieler.hcpLIE : 54.0) || 54.0;
        const hcpsForKurs = app.state.handicaps.filter(function(h) { return String(h.kursId).trim() === String(kursId).trim(); });
        
        let vorgabeMatch = hcpsForKurs.find(function(h) { return parseFloat(h.vorgabe) === hcp; });
        let spielvorgabeTotal = vorgabeMatch ? parseInt(vorgabeMatch.spielvorgabe) : Math.round(hcp);

        let basisSchlaege = Math.floor(spielvorgabeTotal / 18);
        let restSchlaege = spielvorgabeTotal % 18;
        
        let holeVorgabe = basisSchlaege;
        if (parseInt(holeSi) <= restSchlaege)
        {
            holeVorgabe += 1;
        }
        return holeVorgabe;
    },

    calculateNettoStableford: function(strokes, par, holeVorgabe)
    {
        if (!strokes || strokes <= 0) 
        {
            return 0;
        }
        
        let persoenlichesPar = parseInt(par) + parseInt(holeVorgabe);
        let differenz = persoenlichesPar - parseInt(strokes);
        
        let punkte = 2 + differenz;
        return punkte < 0 ? 0 : punkte;
    },

    adjustScore: function(spieltagId, spielerId, holeNr, delta, par, spielvorgabe)
    {
        const key = `${spieltagId}_${spielerId}_${holeNr}`;
        const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;
        
        const dbScores = app.state.scoreCards.filter(function(sc) { return String(sc.spieltagId) === String(spieltagId) && String(sc.spielerId) === String(spielerId); });
        const dbMatch = dbScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === holeNr; });
        const hatDbScore = dbMatch ? parseInt(dbMatch.strokes) : undefined;

        let aktuellerScore = app.state.liveScores[key] || hatDbScore || parseInt(par);
        let neuerScore = aktuellerScore + delta;
        if (neuerScore < 1) 
        {
            neuerScore = 1;
        }

        app.state.liveScores[key] = neuerScore;

        const scoreEl = document.getElementById(`score-val-${spielerId}`);
        if (scoreEl) 
        {
            scoreEl.innerText = neuerScore;
        }

        if (app.state.liveScores[maxScoreKey])
        {
            app.state.liveScores[maxScoreKey] = false;
            const maxBtn = document.getElementById(`maxscore-btn-${spielerId}`);
            if (maxBtn)
            {
                maxBtn.style.backgroundColor = "#ffffff";
                maxBtn.style.borderColor = "#d4d4d8";
                maxBtn.style.color = "#57534e";
                maxBtn.classList.remove("animate-pulse");
                maxBtn.querySelector('i').className = "fas fa-ban";
                maxBtn.querySelector('span').innerText = "Max Ø";
            }
        }

        const nettoPkt = app.logic.calculateNettoStableford(neuerScore, par, spielvorgabe);
        const badgeEl = document.getElementById(`netto-badge-${spielerId}`);
        if (badgeEl) 
        {
            badgeEl.innerText = `${nettoPkt} Netto-Pkt`;
        }
    },

    adjustLiveValue: function(spieltagId, spielerId, holeNr, field, delta)
    {
        const key = `${spieltagId}_${spielerId}_${holeNr}_${field}`;
        
        let currentVal = app.state.liveScores[key];
        if (currentVal === undefined)
        {
            currentVal = 2; 
        }
        
        let newVal = parseInt(currentVal) + delta;
        if (newVal < 0) 
        {
            newVal = 0;
        }
        
        app.state.liveScores[key] = newVal;
        
        const element = document.getElementById(`${field}-val-${spielerId}`);
        if (element)
        {
            element.innerText = newVal;
        }
    },

    toggleLiveBoolean: function(spieltagId, spielerId, holeNr, field)
    {
        const key = `${spieltagId}_${spielerId}_${holeNr}_${field}`;
        
        const currentVal = !!app.state.liveScores[key];
        const newVal = !currentVal;
        
        app.state.liveScores[key] = newVal;
        
        const btn = document.getElementById(`${field}-btn-${spielerId}`);
        if (btn)
        {
            if (newVal)
            {
                btn.style.backgroundColor = "#ef4444";
                btn.style.borderColor = "#dc2626";
                btn.style.color = "#ffffff";
                btn.style.fontWeight = "900";
                btn.querySelector('i').className = "fas fa-beer-mug-empty";
                btn.querySelector('span').innerText = "🍻";
            }
            else
            {
                btn.style.backgroundColor = "#ffffff";
                btn.style.borderColor = "#d4d4d8";
                btn.style.color = "#737373";
                btn.style.fontWeight = "900";
                btn.querySelector('i').className = "fas fa-wine-glass-empty";
                btn.querySelector('span').innerText = "Lady";
            }
        }
    },

    toggleMaxScore: function(spieltagId, spielerId, holeNr, maxScoreValue, par, spielvorgabe)
    {
        const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;
        const scoreKey = `${spieltagId}_${spielerId}_${holeNr}`;
        
        const currentMax = !!app.state.liveScores[maxScoreKey];
        const newMax = !currentMax;
        
        app.state.liveScores[maxScoreKey] = newMax;
        
        const scoreValElement = document.getElementById(`score-val-${spielerId}`);
        const maxBtn = document.getElementById(`maxscore-btn-${spielerId}`);
        
        if (newMax)
        {
            app.state.liveScores[scoreKey] = maxScoreValue;
            if (scoreValElement) 
            {
                scoreValElement.innerText = maxScoreValue;
            }
            
            if (maxBtn)
            {
                maxBtn.style.backgroundColor = "#f59e0b";
                maxBtn.style.borderColor = "#d97706";
                maxBtn.style.color = "#ffffff";
                maxBtn.style.fontWeight = "900";
                maxBtn.classList.add("animate-pulse");
                maxBtn.querySelector('i').className = "fas fa-stroke";
                maxBtn.querySelector('span').innerText = "Strich";
            }
        }
        else
        {
            app.state.liveScores[scoreKey] = par;
            if (scoreValElement) 
            {
                scoreValElement.innerText = par;
            }
            
            if (maxBtn)
            {
                maxBtn.style.backgroundColor = "#ffffff";
                maxBtn.style.borderColor = "#d4d4d8";
                maxBtn.style.color = "#57534e";
                maxBtn.style.fontWeight = "900";
                maxBtn.classList.remove("animate-pulse");
                maxBtn.querySelector('i').className = "fas fa-ban";
                maxBtn.querySelector('span').innerText = "Max Ø";
            }
        }
        
        const neuerScore = app.state.liveScores[scoreKey];
        const neueNettoPunkte = app.logic.calculateNettoStableford(neuerScore, par, spielvorgabe);
        const nettoBadge = document.getElementById(`netto-badge-${spielerId}`);
        if (nettoBadge)
        {
            nettoBadge.innerText = `${neueNettoPunkte} Netto-Pkt`;
        }
    },

    // Schiebt alle ungesicherten lokalen Scores in die Cloud und aktualisiert den State
    syncScoresWithServer: function(spieltagId, flightSeq)
    {
        const keysToSync = Object.keys(app.state.liveScores).filter(function(k) { return k.startsWith(spieltagId + "_"); });
        
        if (keysToSync.length === 0)
        {
            app.logic.showToast("Keine ausstehenden Änderungen.", "info");
            return;
        }

        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn)
        {
            syncBtn.disabled = true;
            syncBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Sende...`;
        }

        app.logic.stopLivePolling();

        const scoresPayload = [];
        const verarbeiteteKeys = {};

        keysToSync.forEach(function(key)
        {
            const parts = key.split('_'); 
            const spielerId = parts[1];
            const holeNr = parseInt(parts[2]);
            
            const uniqueHoleKey = `${spielerId}_${holeNr}`;
            if (verarbeiteteKeys[uniqueHoleKey]) return;
            verarbeiteteKeys[uniqueHoleKey] = true;

            const scoreKey = `${spieltagId}_${spielerId}_${holeNr}`;
            const ladyKey = `${spieltagId}_${spielerId}_${holeNr}_lady`;
            const putsKey = `${spieltagId}_${spielerId}_${holeNr}_puts`;
            const maxScoreKey = `${spieltagId}_${spielerId}_${holeNr}_maxscore`;
            
            let strokes = app.state.liveScores[scoreKey];
            if (strokes === undefined || strokes === null || strokes <= 0) return;

            const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === String(spielerId).trim(); });
            const spieltag = app.state.spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
            const kursBahnen = app.state.bahnen.filter(function(b) { return String(b.kursId) === String(spieltag ? spieltag.kursId : ""); });
            const bahn = kursBahnen.find(function(b) { return parseInt(b.nr) === holeNr; }) || { si: 10 };

            let strokesGiven = app.logic.calculateHoleVorgabe(spieler, spieltag ? spieltag.kursId : "", bahn.si);

            scoresPayload.push({
                id: `SC-${spieltagId}-${spielerId}-${holeNr}`,
                spieltagId: spieltagId,
                flightSeq: parseInt(flightSeq) || 1,
                spielerId: spielerId,
                hole: holeNr,
                strokes: parseInt(strokes),
                strokesGiven: strokesGiven,
                lady: !!app.state.liveScores[ladyKey],
                puts: app.state.liveScores[putsKey] !== undefined ? parseInt(app.state.liveScores[putsKey]) : 2,
                maxscore: !!app.state.liveScores[maxScoreKey]
            });
        });

        if (scoresPayload.length === 0)
        {
            if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `<i class="fas fa-cloud-upload-alt mr-1"></i> Sichern`; }
            app.logic.startLivePolling(spieltagId, null, flightSeq);
            return;
        }

        app.logic.apiRequest('saveLiveScores', { payload: scoresPayload })
            .then(function(response)
            {
                if (response && response.success)
                {
                    keysToSync.forEach(function(key)
                    {
                        delete app.state.liveScores[key];
                    });

                    scoresPayload.forEach(function(item)
                    {
                        const idx = app.state.scoreCards.findIndex(function(sc) { return String(sc.id).trim() === String(item.id).trim(); });
                        if (idx !== -1) 
                        {
                            app.state.scoreCards[idx] = item;
                        }
                        else 
                        {
                            app.state.scoreCards.push(item);
                        }
                    });

                    app.logic.showToast("Scores erfolgreich gesichert!", "success");
                }
                else
                {
                    app.logic.showToast("Sync-Fehler: " + (response ? response.error : "Unbekannt"), "error");
                }

                if (syncBtn)
                {
                    syncBtn.disabled = false;
                    syncBtn.innerHTML = `<i class="fas fa-cloud-upload-alt mr-1"></i> Sichern`;
                }
                app.logic.startLivePolling(spieltagId, null, flightSeq);
            })
            .catch(function(err)
            {
                console.error("Netzwerkfehler beim Sichern:", err);
                app.logic.showToast("Fehler beim Sichern der Daten", "error");
                if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = `<i class="fas fa-cloud-upload-alt mr-1"></i> Sichern`; }
                app.logic.startLivePolling(spieltagId, null, flightSeq);
            });
    },

    logout: function()
    {
        app.logic.showConfirm(
            "Abmelden?", 
            "Möchtest du dich wirklich aus der LIE Scorecard abmelden?", 
            "standard", 
            function() 
            {
                app.state.currentUser = null;
                localStorage.removeItem('lie_scorecard_user_id');
                app.logic.updateHeaderRoleIcon();
                app.router.navigate('login');
                app.logic.showToast("Erfolgreich abgemeldet.", "success");
            }
        );
    },

    updateHeaderRoleIcon: function()
    {
        const badgeContainer = document.getElementById('header-role-badge');
        const logoutBtn = document.getElementById('header-logout-btn');

        if (!badgeContainer) 
        {
            return;
        }

        if (!app.state.currentUser || !app.state.currentUser.role)
        {
            badgeContainer.innerHTML = "";
            if (logoutBtn) logoutBtn.classList.add('hidden');
            return;
        }

        if (logoutBtn) logoutBtn.classList.remove('hidden');

        const rolle = app.state.currentUser.role;
        let iconHtml = "";

        if (rolle === "Admin")
        {
            iconHtml = `<i class="fas fa-user-shield text-amber-400 text-sm" title="Rolle: Administrator"></i>`;
        }
        else if (rolle === "Spielleiter")
        {
            iconHtml = `<i class="fas fa-clipboard-list text-stone-200 text-sm" title="Rolle: Spielleiter"></i>`;
        }
        else
        {
            iconHtml = `<i class="fas fa-golf-ball text-stone-300 text-xs" title="Rolle: Spieler"></i>`;
        }

        badgeContainer.innerHTML = iconHtml;
    },

    toggleFlightMode: function()
    {
        const manualRadio = document.querySelector('input[name="flight-mode"]:checked');
        const autoSect = document.getElementById('auto-flight-section');
        const manSect = document.getElementById('manual-flight-section');
        const previewCont = document.getElementById('flight-preview-container');

        if (!manualRadio || !autoSect || !manSect || !previewCont) 
        {
            return;
        }

        if (manualRadio.value === 'manual')
        {
            autoSect.classList.add('hidden');
            manSect.classList.remove('hidden');
            previewCont.classList.add('hidden');
            
            app.logic.buildManualFlightsBuilder();
        }
        else
        {
            autoSect.classList.remove('hidden');
            manSect.classList.add('hidden');
            previewCont.classList.add('hidden');
        }
    },

    buildManualFlightsBuilder: function()
    {
        if (!app.state.tempManualFlights || Object.keys(app.state.tempManualFlights).length === 0)
        {
            app.state.tempManualFlights = { 1: [] };
            app.state.activeManualFlightSeq = 1;
        }
        app.logic.renderAllManualFlights();
        app.logic.renderAvailablePlayerChips();
    },

    addEmptyManualFlight: function()
    {
        const keys = Object.keys(app.state.tempManualFlights).map(Number);
        const nextSeq = keys.length > 0 ? Math.max(...keys) + 1 : 1;
        
        app.state.tempManualFlights[nextSeq] = [];
        app.state.activeManualFlightSeq = nextSeq;
        
        app.logic.renderAllManualFlights();
        app.logic.renderAvailablePlayerChips();
    },

    renderAllManualFlights: function()
    {
        const builderCont = document.getElementById('manual-flights-builder');
        if (!builderCont) 
        {
            return;
        }

        let builderHtml = "";
        Object.keys(app.state.tempManualFlights).forEach(function(fKey)
        {
            const flightNr = parseInt(fKey);
            const spielerIds = app.state.tempManualFlights[flightNr] || [];
            const anzahlSpieler = spielerIds.length;
            
            let spielerListeHtml = `
                <p class="text-stone-400 text-xs italic text-center py-2">
                    Noch leer. Spieler unten anklicken...
                </p>
            `;

            if (anzahlSpieler > 0)
            {
                spielerListeHtml = spielerIds.map(function(sId)
                {
                    const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === String(sId).trim(); });
                    return `
                        <div class="flex justify-between items-center bg-stone-100 p-2 rounded-xl border border-stone-200 text-stone-800 font-medium text-xs">
                            <span>${spieler ? spieler.name + ' (' + spieler.nickname + ')' : sId}</span>
                            <button onclick="app.logic.removeSpielerFromManualFlight(${flightNr}, '${sId}'); event.stopPropagation();" class="text-red-600 px-2 touch-target"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    `;
                }).join('');
            }

            const isActive = (flightNr === app.state.activeManualFlightSeq);
            const activeStyle = isActive ? 'border-emerald-500 bg-emerald-50/10' : 'border-stone-200 bg-white';

            builderHtml += `
                <div onclick="app.state.activeManualFlightSeq = ${flightNr}; app.logic.renderAllManualFlights();" class="p-4 border ${activeStyle} rounded-2xl space-y-2 cursor-pointer transition">
                    <h5 class="text-xs font-bold text-stone-600 uppercase tracking-wider">Flight ${flightNr} (${anzahlSpieler} Spieler)</h5>
                    <div class="space-y-1">
                        ${spielerListeHtml}
                    </div>
                </div>
            `;
        });

        builderCont.innerHTML = builderHtml;
    },

    renderAvailablePlayerChips: function()
    {
        const chipsCont = document.getElementById('available-players-chips');
        if (!chipsCont) 
        {
            return;
        }

        const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
        const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });

        let bereitsInFlight = [];
        Object.keys(app.state.tempManualFlights || {}).forEach(function(fKey)
        {
            bereitsInFlight = bereitsInFlight.concat(app.state.tempManualFlights[fKey]);
        });

        const freieIds = gewaehlteIds.filter(function(id) { return !bereitsInFlight.includes(id); });

        if (freieIds.length === 0)
        {
            chipsCont.innerHTML = `<p class="text-stone-400 text-xs italic mx-auto">Alle Spieler zugeordnet.</p>`;
            return;
        }

        chipsCont.innerHTML = freieIds.map(function(sId)
        {
            const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === String(sId).trim(); });
            const name = spieler ? spieler.nickname : sId;
            return `
                <button type="button" onclick="app.logic.addSpielerToManualFlight('${sId}')" class="bg-white border border-stone-200 hover:bg-stone-50 px-3 py-1.5 rounded-xl text-xs font-semibold text-stone-700 flex items-center gap-1 shadow-3xs touch-target">
                    <i class="fas fa-user-plus text-stone-400 text-[10px]"></i> ${name}
                </button>
            `;
        }).join('');
    },

    addSpielerToManualFlight: function(spielerId)
    {
        const aktSeq = app.state.activeManualFlightSeq;
        if (!app.state.tempManualFlights[aktSeq]) 
        {
            app.state.tempManualFlights[aktSeq] = [];
        }

        if (app.state.tempManualFlights[aktSeq].length >= 4)
        {
            app.logic.showToast("Ein Flight darf maximal 4 Spieler enthalten.", "info");
            return;
        }

        app.state.tempManualFlights[aktSeq].push(spielerId);
        app.logic.renderAllManualFlights();
        app.logic.renderAvailablePlayerChips();
    },

    removeSpielerFromManualFlight: function(flightNr, spielerId)
    {
        if (!app.state.tempManualFlights[flightNr]) 
        {
            return;
        }
        app.state.tempManualFlights[flightNr] = app.state.tempManualFlights[flightNr].filter(function(id) { return id !== spielerId; });
        app.logic.renderAllManualFlights();
        app.logic.renderAvailablePlayerChips();
    },

    saveManualFlights: function()
    {
        const kursSelect = document.getElementById('new-spieltag-kurs');
        const dateInput = document.getElementById('new-spieltag-date');
        const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
        const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });

        if (!kursSelect || !dateInput || gewaehlteIds.length === 0) 
        {
            app.logic.showToast("Bitte fülle alle Felder aus!", "info");
            return;
        }

        if (!app.state.tempManualFlights || Object.keys(app.state.tempManualFlights).length === 0)
        {
            app.logic.showToast("Bitte ordne die Spieler zuerst den Flights zu!", "info");
            return;
        }

        let verbauteIds = [];
        Object.keys(app.state.tempManualFlights).forEach(function(fKey)
        {
            verbauteIds = verbauteIds.concat(app.state.tempManualFlights[fKey]);
        });

        if (verbauteIds.length !== gewaehlteIds.length)
        {
            app.logic.showToast("Es wurden noch nicht alle Turnierteilnehmer zugewiesen!", "info");
            return;
        }

        const spieltagId = "ST-" + Date.now();
        const spieltagObj = {
            id: spieltagId,
            date: dateInput.value,
            kursId: kursSelect.value,
            status: "Aktiv",
            teilnehmerCsv: gewaehlteIds.join(','),
            bruttoSieger: "",
            nettoSieger: ""
        };

        const flightsPayload = [];
        Object.keys(app.state.tempManualFlights).forEach(function(fKey)
        {
            const flightSpielerIds = app.state.tempManualFlights[fKey];
            if (flightSpielerIds.length > 0)
            {
                flightsPayload.push({
                    id: `FL-${spieltagId}-${fKey}`,
                    spieltagId: spieltagId,
                    spielerIdsCsv: flightSpielerIds.join(',')
                });
            }
        });

        app.logic.apiRequest('createNewSpieltag', { spieltagObj: spieltagObj, flightsPayload: flightsPayload })
            .then(function(response)
            {
                if (response && response.success)
                {
                    app.state.spieltage.push(spieltagObj);
                    flightsPayload.forEach(function(f) { app.state.flights.push(f); });
                    
                    app.logic.showToast("Spieltag und manuelle Flights angelegt!", "success");
                    app.router.navigate('spieltage');
                }
                else
                {
                    app.logic.showToast("Fehler beim Speichern: " + response.error, "error");
                }
            });
    },

    previewFlights: function()
    {
        const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
        const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });
        const sizeRadio = document.querySelector('input[name="flight-size"]:checked');
        const previewCont = document.getElementById('flight-preview-container');

        if (gewaehlteIds.length === 0 || !sizeRadio || !previewCont)
        {
            app.logic.showToast("Bitte wähle mindestens einen Spieler aus!", "info");
            return;
        }

        const totalPlayers = gewaehlteIds.length;
        const selectedOption = sizeRadio.value;

        // Regel-Mapping nach Wunschschema (1-20 Spieler)
        const standardRules = {
            1: [1],
            2: [2],
            3: [3],
            4: [4],
            5: [2, 3],
            6: [3, 3],
            7: [3, 4],
            8: [4, 4],
            9: [3, 3, 3],
            10: [3, 3, 4],
            11: [3, 4, 4],
            12: [4, 4, 4],
            13: [3, 3, 3, 4],
            14: [3, 3, 4, 4],
            15: [3, 4, 4, 4],
            16: [4, 4, 4, 4],
            17: [3, 3, 3, 4, 4],
            18: [3, 3, 4, 4, 4],
            19: [3, 4, 4, 4, 4],
            20: [4, 4, 4, 4, 4]
        };

        let flightSizesPattern = [];

        if (selectedOption === 'standard')
        {
            if (standardRules[totalPlayers])
            {
                flightSizesPattern = standardRules[totalPlayers];
            }
            else
            {
                // Fallback für > 20 Spieler (Bevorzugt 4er, füllt mit 3ern auf)
                let remaining = totalPlayers;
                while (remaining > 0)
                {
                    if (remaining % 4 === 0 || remaining >= 8)
                    {
                        flightSizesPattern.push(4);
                        remaining -= 4;
                    }
                    else if (remaining % 3 === 0)
                    {
                        flightSizesPattern.push(3);
                        remaining -= 3;
                    }
                    else
                    {
                        flightSizesPattern.push(4);
                        remaining -= 4;
                    }
                }
            }
        }
        else
        {
            // Fest vorgegebene Flight-Größen (2er, 3er oder 4er)
            const targetSize = parseInt(selectedOption);
            let remaining = totalPlayers;
            while (remaining > 0)
            {
                const currentSize = Math.min(remaining, targetSize);
                flightSizesPattern.push(currentSize);
                remaining -= currentSize;
            }
        }

        // Spielerliste zufällig durchmischen (Fisher-Yates-Shuffle)
        const gemischteIds = [...gewaehlteIds];
        for (let i = gemischteIds.length - 1; i > 0; i--)
        {
            const j = Math.floor(Math.random() * (i + 1));
            [gemischteIds[i], gemischteIds[j]] = [gemischteIds[j], gemischteIds[i]];
        }

        // Flights basierend auf dem ermittelten Größen-Pattern befüllen
        const generierteFlights = [];
        flightSizesPattern.forEach(function(size)
        {
            generierteFlights.push(gemischteIds.splice(0, size));
        });

        app.state.tempZufallsFlights = generierteFlights;

        // Vorschau-Rendering
        let previewHtml = `<h4 class="text-xs font-bold text-stone-500 uppercase tracking-wider mt-2"><i class="fas fa-eye"></i> Auslosungs-Vorschau (${totalPlayers} Spieler)</h4>`;
        generierteFlights.forEach(function(flightIds, index)
        {
            const namenList = flightIds.map(function(id)
            {
                const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === String(id).trim(); });
                return spieler ? spieler.nickname : id;
            }).join(', ');

            previewHtml += `
                <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 font-semibold flex justify-between items-center">
                    <div><span class="text-emerald-700 font-bold">Flight ${index + 1}:</span> ${namenList}</div>
                    <span class="text-[10px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-md font-bold">${flightIds.length}er</span>
                </div>
            `;
        });

        previewHtml += `
            <button onclick="app.logic.saveZufallsFlights()" class="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-3 rounded-xl transition text-sm shadow-xs mt-1">
                <i class="fas fa-check-circle mr-1"></i> Auslosung bestätigen & Runde starten
            </button>
        `;

        previewCont.innerHTML = previewHtml;
        previewCont.classList.remove('hidden');
    },

    saveZufallsFlights: function()
    {
        const kursSelect = document.getElementById('new-spieltag-kurs');
        const dateInput = document.getElementById('new-spieltag-date');
        const checkedBoxes = document.querySelectorAll('input[name="teilnehmer"]:checked');
        const gewaehlteIds = Array.from(checkedBoxes).map(function(cb) { return cb.value; });

        if (!kursSelect || !dateInput || !app.state.tempZufallsFlights) 
        {
            return;
        }

        const spieltagId = "ST-" + Date.now();
        const spieltagObj = {
            id: spieltagId,
            date: dateInput.value,
            kursId: kursSelect.value,
            status: "Aktiv",
            teilnehmerCsv: gewaehlteIds.join(','),
            bruttoSieger: "",
            nettoSieger: ""
        };

        const flightsPayload = app.state.tempZufallsFlights.map(function(flightIds, index)
        {
            return {
                id: `FL-${spieltagId}-${index + 1}`,
                spieltagId: spieltagId,
                spielerIdsCsv: flightIds.join(',')
            };
        });

        app.logic.apiRequest('createNewSpieltag', { spieltagObj: spieltagObj, flightsPayload: flightsPayload })
            .then(function(response)
            {
                if (response && response.success)
                {
                    app.state.spieltage.push(spieltagObj);
                    flightsPayload.forEach(function(f) { app.state.flights.push(f); });
                    
                    app.logic.showToast("Spieltag und Flights generiert!", "success");
                    app.router.navigate('spieltage');
                }
                else
                {
                    app.logic.showToast("Fehler aufgetreten: " + response.error, "error");
                }
            });
    },

    cancelActiveSpieltag: function(spieltagId)
    {
        app.logic.showConfirm(
            "Spieltag abbrechen?", 
            "Die Runde wird aus der Übersicht ausgeblendet, bleibt aber in der Datenbank dokumentiert.", 
            "danger", 
            function() 
            {
                const btn = document.getElementById('cancel-round-btn');
                if (btn)
                {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Verarbeite Abbruch...`;
                }

                app.logic.apiRequest('cancelSpieltagServer', { spieltagId: spieltagId })
                    .then(function(response)
                    {
                        if (response && response.success)
                        {
                            const spieltag = app.state.spieltage.find(function(st) { return st.id === spieltagId; });
                            if (spieltag)
                            {
                                spieltag.status = "Abgebrochen";
                            }

                            app.logic.showToast("Der Spieltag wurde erfolgreich abgebrochen!", "success");
                            app.router.navigate('spieltage');
                        }
                        else
                        {
                            app.logic.showToast("Fehler beim Abbrechen: " + response.error, "error");
                            if (btn)
                            {
                                btn.disabled = false;
                                btn.innerHTML = `<i class="fas fa-times-circle mr-1"></i> Spieltag abbrechen`;
                            }
                        }
                    })
                    .catch(function(err)
                    {
                        app.logic.showToast("Netzwerkfehler: " + err, "error");
                        if (btn)
                        {
                            btn.disabled = false;
                            btn.innerHTML = `<i class="fas fa-times-circle mr-1"></i> Spieltag abbrechen`;
                        }
                    });
            }
        );
    },

    closeActiveSpieltag: function(spieltagId, bruttoSieger, nettoSieger)
    {
        const spieltag = app.state.spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
        if (!spieltag)
        {
            app.logic.showToast("Spieltag nicht gefunden!", "error");
            return;
        }

        const teilnehmerString = String(spieltag.teilnehmerCsv || "");
        const teilnehmerIds = teilnehmerString ? teilnehmerString.split(',').map(function(id) { return String(id).trim(); }) : [];
        
        const kurs = app.state.kurse.find(function(k) { return String(k.id).trim() === String(spieltag.kursId).trim(); });
        const kursBahnen = app.state.bahnen.filter(function(b) { return String(b.kursId).trim() === String(spieltag.kursId).trim(); });

        let maxBahnen = (kurs && kurs.bahnAnzahl) ? parseInt(kurs.bahnAnzahl) : 0;
        
        if (maxBahnen === 0)
        {
            maxBahnen = kursBahnen.length;
        }

        if (maxBahnen === 0)
        {
            maxBahnen = 9; 
        }

        const stablefordSoll = (maxBahnen <= 9) ? 18 : 36;

        const handicapUpdates = [];
        let infoText = "";

        teilnehmerIds.forEach(function(spielerId)
        {
            const spieler = app.state.spieler.find(function(s) { return String(s.id).trim() === spielerId; });
            if (!spieler) 
            {
                return;
            }

            const dbScores = app.state.scoreCards.filter(function(sc) 
            {
                return String(sc.spieltagId).trim() === String(spieltagId).trim() && String(sc.spielerId).trim() === spielerId;
            });

            let totalNettoStableford = 0;
            let playedHoles = 0;

            const bahnenSchleife = kursBahnen.length > 0 ? kursBahnen : Array.from({length: maxBahnen}, function(_, i) { return { nr: i + 1, par: 4, si: 10 }; });

            bahnenSchleife.forEach(function(bahn)
            {
                const hNr = parseInt(bahn.nr);
                const liveKey = `${spieltagId}_${spielerId}_${hNr}`;
                let strokes = app.state.liveScores[liveKey];

                if (strokes === undefined)
                {
                    const dbMatch = dbScores.find(function(sc) { return sc.hole !== undefined && parseInt(sc.hole) === hNr; });
                    if (dbMatch) 
                    {
                        strokes = parseInt(dbMatch.strokes);
                    }
                }

                if (strokes !== undefined && strokes > 0)
                {
                    playedHoles++;
                    let holeVorgabe = app.logic.calculateHoleVorgabe(spieler, spieltag.kursId, bahn.si);
                    const nettoPkt = app.logic.calculateNettoStableford(strokes, bahn.par, holeVorgabe);
                    totalNettoStableford += nettoPkt;
                }
            });

            if (playedHoles >= maxBahnen)
            {
                const altesHcp = parseInt(spieler.hcpLIE) || 54;
                let neuesHcp = altesHcp;

                if (totalNettoStableford > stablefordSoll)
                {
                    const punkteUeberSoll = totalNettoStableford - stablefordSoll;
                    const verbesserung = punkteUeberSoll * 0.5;
                    neuesHcp = Math.max(0, Math.round(altesHcp - verbesserung));
                }
                else if (totalNettoStableford < stablefordSoll)
                {
                    const punkteUnterSoll = stablefordSoll - totalNettoStableford;
                    const verschlechterung = punkteUnterSoll * 0.1;
                    neuesHcp = Math.min(54, Math.round(altesHcp + verschlechterung));
                }

                if (parseInt(neuesHcp) !== parseInt(altesHcp))
                {
                    handicapUpdates.push({
                        spielerId: String(spielerId).trim(),
                        newHcpLie: parseInt(neuesHcp)
                    });
                    infoText += ` | ${spieler.nickname}: ${altesHcp}➔${neuesHcp}`;
                }
            }
        });

        const confirmationMsg = `Möchtest du die Runde jetzt schließen? Sieger: Brutto: ${bruttoSieger}, Netto: ${nettoSieger}. HCP-Updates:${infoText || " Keine (alle im Puffer)"}. Danach sind keine Korrekturen mehr möglich.`;

        app.logic.showConfirm(
            "Spieltag beenden?", 
            confirmationMsg, 
            "standard", 
            function() 
            {
                const btn = document.getElementById('close-round-btn');
                if (btn)
                {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Berechne & Schließe...`;
                }

                app.logic.apiRequest('closeSpieltagServer', { spieltagId: spieltagId, bruttoSieger: bruttoSieger, nettoSieger: nettoSieger, handicapUpdates: handicapUpdates })
                    .then(function(response)
                    {
                        if (response && response.success)
                        {
                            const spieltagObj = app.state.spieltage.find(function(st) { return String(st.id).trim() === String(spieltagId).trim(); });
                            if (spieltagObj)
                            {
                                spieltagObj.status = "Beendet";
                                spieltagObj.bruttoSieger = bruttoSieger;
                                spieltagObj.nettoSieger = nettoSieger;
                            }

                            handicapUpdates.forEach(function(upd)
                            {
                                const sp = app.state.spieler.find(function(s) { return String(s.id).trim() === String(upd.spielerId).trim(); });
                                if (sp)
                                {
                                    sp.hcpLIE = upd.newHcpLie;
                                }
                            });

                            app.logic.showToast("Der Spieltag wurde offiziell beendet!", "success");
                            app.router.navigate('spieltage');
                        }
                        else
                        {
                            app.logic.showToast("Fehler beim Beenden der Runde: " + response.error, "error");
                            if (btn)
                            {
                                btn.disabled = false;
                                btn.innerHTML = `<i class="fas fa-flag-checkered mr-1"></i> Spieltag offiziell beenden`;
                            }
                        }
                    });
            }
        );
    },

    submitPin: function(event) 
    {
        if (event) 
        {
            if (typeof event.preventDefault === 'function') event.preventDefault();
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
        }
    
        const btn = document.getElementById('loginSubmitBtn') || (event && event.target);
        if (btn && btn.disabled) 
        {
            return false;
        }
    
        const spielerId = document.getElementById('loginSpielerSelect')?.value;
        const pin = document.getElementById('loginPinInput')?.value;
    
        if (!spielerId || !pin || pin.trim() === "") 
        {
            if (typeof app.logic.showToast === 'function') 
            {
                app.logic.showToast("Bitte Namen auswählen und PIN eintippen!");
            }
            return false;
        }
    
        if (btn && typeof btn.setAttribute === 'function') 
        {
            btn.disabled = true;
            btn.dataset.oldText = btn.innerText || btn.value;
            btn.innerText = "Prüfe...";
        }
    
        app.logic.apiRequest('verifyPlayerPin', { spielerId: spielerId, pin: pin.trim() })
        .then(function(response) 
        {
            if (response && response.success) 
            {
                app.state = app.state || {};
                app.state.currentUser = app.state.spieler.find(function(s) {
                    return String(s.id) === String(spielerId);
                });

                if (response.mustChange) 
                {
                    localStorage.removeItem('lie_scorecard_user_id');
                    app.router.navigate('pin_aendern');
                } 
                else 
                {
                    if (app.state.currentUser)
                    {
                        localStorage.setItem('lie_scorecard_user_id', app.state.currentUser.id);
                    }
                    app.router.navigate('dashboard');
                }
            } 
            else 
            {
                const errMsg = (response && response.error) ? response.error : "Falsche PIN!";
                if (typeof app.logic.showToast === 'function') app.logic.showToast(errMsg, "error");
                
                if (btn) btn.disabled = false;
                if (btn && btn.dataset.oldText) btn.innerText = btn.dataset.oldText;
            }
        })
        .catch(function(err) 
        {
            if (typeof app.logic.showToast === 'function') 
            {
                app.logic.showToast("Fehler bei der PIN-Verifizierung: " + err.message, "error");
            }
            
            if (btn) btn.disabled = false;
            if (btn && btn.dataset.oldText) btn.innerText = btn.dataset.oldText;
        });
    
        return false;
    },

    changePin: function()
    {
        const p1 = document.getElementById('pin-new-1');
        const p2 = document.getElementById('pin-new-2');
        if (!p1 || !p2 || !app.state.currentUser) 
        {
            return;
        }

        const val1 = p1.value.trim();
        const val2 = p2.value.trim();

        if (val1.length < 4 || isNaN(val1))
        {
            app.logic.showToast("Die PIN muss mindestens 4 Zahlen lang sein!", "info");
            return;
        }

        if (val1 !== val2)
        {
            app.logic.showToast("Die beiden PINs stimmen nicht überein!", "info");
            return;
        }

        if (val1 === "4722")
        {
            app.logic.showToast("Du darfst nicht die Standard-PIN verwenden!", "info");
            return;
        }

        const btn = document.getElementById('change-pin-btn');
        if (btn)
        {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Speichere PIN...`;
        }

        app.logic.apiRequest('changePlayerPinServer', { spielerId: app.state.currentUser.id, newPin: val1 })
            .then(function(response)
            {
                if (response && response.success)
                {
                    app.logic.showToast("PIN geändert! Bitte melde dich mit deiner neuen PIN an.", "success");
                    app.state.currentUser = null;
                    localStorage.removeItem('lie_scorecard_user_id');
                    app.router.navigate('login');
                }
                else
                {
                    app.logic.showToast("Fehler bei PIN-Änderung: " + response.error, "error");
                    if (btn)
                    {
                        btn.disabled = false;
                        btn.innerHTML = `<i class="fas fa-key mr-1"></i> PIN dauerhaft speichern`;
                    }
                }
            });
    },

    savePlayer: function(isNew)
    {
        const idInput = document.getElementById('edit-sp-id');
        const nicknameInput = document.getElementById('edit-sp-nickname');
        const nameInput = document.getElementById('edit-sp-name');
        const emailInput = document.getElementById('edit-sp-email');
        const hcpOffInput = document.getElementById('edit-sp-hcpoff');
        const hcpLieInput = document.getElementById('edit-sp-hcplie');
        const teeSelect = document.getElementById('edit-sp-tee');
        const roleSelect = document.getElementById('edit-sp-role');

        if (!idInput || !nicknameInput || !nameInput || !emailInput) 
        {
            return;
        }

        const spielerObj = {
            isNew: isNew,
            id: idInput.value.trim(),
            nickname: nicknameInput.value.trim(),
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            teeColor: teeSelect ? teeSelect.value : 'Gelb',
            hcpOfficial: parseFloat(hcpOffInput ? hcpOffInput.value : 54.0),
            hcpLIE: parseInt(hcpLieInput ? hcpLieInput.value : 54),
            role: roleSelect ? roleSelect.value : 'Spieler'
        };

        if (!spielerObj.id || !spielerObj.nickname || !spielerObj.name || !spielerObj.email)
        {
            app.logic.showToast("Bitte fülle alle Pflichtfelder (*) aus!", "info");
            return;
        }

        const btn = document.getElementById('save-player-btn');
        if (btn)
        {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-circle-notch fa-spin mr-1"></i> Speichere Profil...`;
        }

        app.logic.apiRequest('savePlayerServer', spielerObj)
            .then(function(response)
            {
                if (response && response.success)
                {
                    app.logic.showToast("Spielerprofil erfolgreich gespeichert!", "success");

                    if (app.state.currentUser && String(app.state.currentUser.id).trim() === String(spielerObj.id).trim())
                    {
                        app.state.currentUser.role = spielerObj.role;
                    }

                    app.logic.apiRequest('getInitialAppData')
                        .then(function(freshData)
                        {
                            if (freshData && freshData.success)
                            {
                                app.state.spieler = freshData.spieler || [];
                                app.state.spieltage = freshData.spieltage || [];
                            }
                            
                            app.router.updateNavigationUI('spieler');
                            app.logic.updateHeaderRoleIcon();
                            app.router.navigate('spieler');
                        });
                }
                else
                {
                    app.logic.showToast("Fehler: " + (response ? response.error : "Unbekannt"), "error");
                    if (btn)
                    {
                        btn.disabled = false;
                        btn.innerHTML = `<i class="fas fa-save mr-1"></i> Profil speichern`;
                    }
                }
            })
            .catch(function(err)
            {
                app.logic.showToast("Netzwerkfehler beim Speichern: " + err, "error");
                if (btn)
                {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fas fa-save mr-1"></i> Profil speichern`;
                }
            });
    },

    deletePlayer: function(spielerId)
    {
        app.logic.showConfirm(
            "Spieler löschen?", 
            "Möchtest du diesen Spieler wirklich unwiderruflich aus der Datenbank löschen? Alle PIN-Einträge werden ebenfalls entfernt.", 
            "danger", 
            function() 
            {
                app.logic.apiRequest('deletePlayerServer', { spielerId: spielerId })
                    .then(function(response)
                    {
                        if (response && response.success)
                        {
                            app.state.spieler = app.state.spieler.filter(function(s) { return String(s.id).trim() !== String(spielerId).trim(); });
                            app.logic.showToast("Spieler erfolgreich gelöscht.", "success");
                            app.router.navigate('spieler');
                        }
                        else
                        {
                            app.logic.showToast("Fehler beim Löschen: " + response.error, "error");
                        }
                    });
            }
        );
    },

    resetPlayerPin: function(spielerId)
    {
        app.logic.showConfirm(
            "PIN zurücksetzen?", 
            "Möchtest du die PIN dieses Spielers wirklich auf den Standardwert '4722' zurücksetzen?", 
            "standard", 
            function() 
            {
                app.logic.apiRequest('setPlayerPin', { spielerId: spielerId, pin: "4722", mustChange: true })
                    .then(function(response)
                    {
                        if (response && response.success)
                        {
                            app.logic.showToast("Die PIN wurde erfolgreich auf 4722 zurückgesetzt.", "success");
                        }
                        else
                        {
                            app.logic.showToast("Fehler bei PIN-Reset: " + response.error, "error");
                        }
                    });
            }
        );
    },

    triggerMasterReset: function()
    {
        app.logic.showConfirm(
            "!!! GEFAHRENZONE !!!", 
            "Möchtest du wirklich alle gespielten Runden, Flights und abgegebenen Scorekarten unwiderruflich löschen? Das System wird in den Urzustand versetzt.", 
            "danger", 
            function() 
            {
                const btn = document.getElementById('master-reset-db-btn');
                if (btn)
                {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fas fa-bomb fa-spin mr-1"></i> Sprengung läuft...`;
                }

                app.logic.apiRequest('clearTestDataBase')
                    .then(function(response)
                    {
                        if (response && response.success)
                        {
                            app.logic.showToast("BUMM! Datenbank erfolgreich gereinigt!", "success");
                            
                            app.state.spieltage = [];
                            app.state.scoreCards = [];
                            app.state.flights = [];
                            app.state.liveScores = {};
                            
                            app.router.navigate('dashboard');
                        }
                        else
                        {
                            app.logic.showToast("Fehler beim Master-Reset: " + response.error, "error");
                            if (btn)
                            {
                                btn.disabled = false;
                                btn.innerHTML = `<i class="fas fa-bomb mr-1"></i> Testdaten-Sprengung ausführen`;
                            }
                        }
                    })
                    .catch(function(err)
                    {
                        app.logic.showToast("Kritischer Netzwerkfehler: " + err, "error");
                        if (btn)
                        {
                            btn.disabled = false;
                            btn.innerHTML = `<i class="fas fa-bomb mr-1"></i> Testdaten-Sprengung ausführen`;
                        }
                    });
            }
        );
    },

    softDeleteSpieltag: function(spieltagId)
    {
        app.logic.showConfirm(
            "Spieltag löschen?", 
            "Möchtest du diesen Spieltag wirklich löschen? Er wird für alle Teilnehmer ausgeblendet.", 
            "danger", 
            function() 
            {
                app.logic.apiRequest('softDeleteSpieltagServer', { spieltagId: spieltagId })
                    .then(function(response)
                    {
                        if (response && response.success)
                        {
                            const st = app.state.spieltage.find(function(s) { return String(s.id).trim() === String(spieltagId).trim(); });
                            if (st)
                            {
                                st.istGeloescht = true;
                            }
    
                            app.logic.showToast("Spieltag erfolgreich gelöscht.", "success");
                            app.router.navigate('spieltage');
                        }
                        else
                        {
                            app.logic.showToast("Fehler beim Löschen: " + (response ? response.error : "Unbekannt"), "error");
                        }
                    });
            }
        );
    },

    showToast: function(text, type)
    {
        let container = document.getElementById('global-toast-container');
        
        if (!container)
        {
            container = document.createElement('div');
            container.id = 'global-toast-container';
            container.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none';
            document.body.appendChild(container);
        }

        let bgClass = "bg-stone-900 text-white";
        let iconHtml = '<i class="fas fa-info-circle"></i>';

        if (type === 'success')
        {
            bgClass = "bg-emerald-600 text-white shadow-md shadow-emerald-600/20";
            iconHtml = '<i class="fas fa-check-circle"></i>';
        }
        else if (type === 'error')
        {
            bgClass = "bg-red-600 text-white shadow-md shadow-red-600/20";
            iconHtml = '<i class="fas fa-exclamation-circle"></i>';
        }
        else if (type === 'warning')
        {
            bgClass = "bg-amber-500 text-white shadow-md shadow-amber-500/20";
            iconHtml = '<i class="fas fa-triangle-exclamation"></i>';
        }

        const toast = document.createElement('div');
        toast.className = `${bgClass} px-4 py-3 rounded-xl text-xs font-semibold flex items-center space-x-2.5 shadow-lg transition-all duration-300 opacity-0 translate-y-2 pointer-events-auto`;
        toast.innerHTML = `<span>${iconHtml}</span><span class="flex-1">${text}</span>`;
        
        container.appendChild(toast);

        setTimeout(function() {
            toast.classList.remove('opacity-0', 'translate-y-2');
        }, 10);

        setTimeout(function() {
            toast.classList.add('opacity-0', '-translate-y-2');
            setTimeout(function() {
                toast.remove();
            }, 300);
        }, 3200);
    },

    showConfirm: function(title, message, mode, onConfirm)
    {
        const modal = document.getElementById('global-confirm-modal');
        const box = document.getElementById('confirm-modal-box');
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const iconContainer = document.getElementById('confirm-modal-icon-container');
        const iconEl = document.getElementById('confirm-modal-icon');
        const btnCancel = document.getElementById('confirm-modal-cancel');
        const btnSubmit = document.getElementById('confirm-modal-submit');

        if (!modal) return;

        titleEl.innerText = title;
        msgEl.innerText = message;

        if (mode === 'danger')
        {
            iconContainer.className = "w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 bg-red-100 text-red-600";
            iconEl.className = "fas fa-radiation text-sm";
            btnSubmit.className = "bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs";
        }
        else
        {
            iconContainer.className = "w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 bg-emerald-100 text-emerald-700";
            iconEl.className = "fas fa-question-circle text-sm";
            btnSubmit.className = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs";
        }

        modal.classList.remove('hidden');
        setTimeout(function() {
            box.classList.remove('opacity-0', 'scale-95');
        }, 10);

        const closeModal = function() {
            box.classList.add('opacity-0', 'scale-95');
            setTimeout(function() {
                modal.classList.add('hidden');
            }, 200);
        };

        btnCancel.onclick = function() {
            closeModal();
        };

        btnSubmit.onclick = function() {
            closeModal();
            if (typeof onConfirm === 'function') onConfirm();
        };
    },

    startLivePolling: function(spieltagId, holeNr, flightSeq)
    {
        app.logic.stopLivePolling();

        const triggerUpdate = function()
        {
            const statusDot = document.getElementById('connection-status');
            if (statusDot)
            {
                statusDot.className = "w-3 h-3 rounded-full bg-amber-400";
            }

            app.logic.apiRequest('getLiveScoreUpdates', { spieltagId: spieltagId })
                .then(function(response)
                {
                    if (statusDot)
                    {
                        statusDot.className = "w-3 h-3 rounded-full bg-emerald-400";
                    }

                    if (response && response.success)
                    {
                        const otherRoundScores = app.state.scoreCards.filter(function(sc)
                        {
                            return String(sc.spieltagId).trim() !== String(spieltagId).trim();
                        });
                        app.state.scoreCards = otherRoundScores.concat(response.scoreCards || []);

                        if (response.pollingRate && response.pollingRate !== app.state.currentPollingRate)
                        {
                            app.state.currentPollingRate = response.pollingRate;
                            app.logic.startLivePolling(spieltagId, holeNr, flightSeq);
                        }

                        const container = document.getElementById('app-container');
                        if (container)
                        {
                            if (app.state.currentView === 'leaderboard')
                            {
                                const activeTab = document.querySelector('[onclick*="brutto"]')?.classList.contains('bg-white') ? 'brutto' : 'netto';
                                container.innerHTML = app.views.leaderboard(spieltagId, activeTab);
                            }
                            else if (app.state.currentView === 'score_eingabe' && holeNr)
                            {
                                const ungesicherteAenderungen = Object.keys(app.state.liveScores).filter(function(k)
                                {
                                    return k.startsWith(spieltagId + "_");
                                }).length;

                                if (ungesicherteAenderungen === 0)
                                {
                                    container.innerHTML = app.views.score_eingabe(spieltagId, holeNr, flightSeq);
                                }
                            }
                        }
                    }
                })
                .catch(function(err)
                {
                    if (statusDot)
                    {
                        statusDot.className = "w-3 h-3 rounded-full bg-red-400";
                    }
                    console.warn("Polling-Update fehlgeschlagen:", err);
                });
        };

        const msInterval = app.state.currentPollingRate * 1000;
        app.state.pollingIntervalId = setInterval(triggerUpdate, msInterval);
    },

    stopLivePolling: function()
    {
        if (app.state.pollingIntervalId)
        {
            clearInterval(app.state.pollingIntervalId);
            app.state.pollingIntervalId = null;
        }
    }
};