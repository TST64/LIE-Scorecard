
// =========================================================================
// BMAssistent / LIE Scorecard - Startup Bootstrapper
// App_Start.html
// BSD (Allman) Style
// =========================================================================

app.onDataLoaded = function(response)
{
    const statusDot = document.getElementById('connection-status');
    
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

        if (statusDot)
        {
            statusDot.className = "w-3 h-3 rounded-full bg-emerald-400";
        }

        // === AUTOMATISCHER LOGIN-CHECK PER LOCALSTORAGE ===
        const gespeicherteSpielerId = localStorage.getItem('lie_scorecard_user_id');
        let autoLoginErfolgreich = false;

        if (gespeicherteSpielerId)
        {
            const gefundenesProfil = app.state.spieler.find(function(s) 
            { 
                return String(s.id).trim() === String(gespeicherteSpielerId).trim(); 
            });

            if (gefundenesProfil)
            {
                app.state.currentUser = gefundenesProfil;
                autoLoginErfolgreich = true;
                
                setTimeout(function()
                {
                    app.router.navigate('dashboard');
                    app.logic.updateHeaderRoleIcon();
                }, 10);
            }
        }

        if (!autoLoginErfolgreich)
        {
            setTimeout(function()
            {
                app.router.navigate('login');
                app.logic.updateHeaderRoleIcon();
            }, 10);
        }
    }
    else
    {
        if (statusDot) 
        {
            statusDot.className = "w-3 h-3 rounded-full bg-red-500";
        }
        
        const container = document.getElementById('app-container');
        if (container)
        {
            container.innerHTML = `
                <div class="p-6 bg-red-50 text-red-800 rounded-2xl border border-red-200 space-y-2">
                    <h3 class="font-bold text-base"><i class="fas fa-exclamation-triangle"></i> Kritischer Ladefehler</h3>
                    <p class="text-xs">Die App-Datenbank konnte nicht geladen werden. Bitte wende dich an die Spielleitung.</p>
                    <pre class="bg-white p-2 rounded text-[10px] overflow-x-auto border border-red-100">${response ? response.error : 'Unbekannter Fehler'}</pre>
                </div>
            `;
        }
    }
};

// Start-Trigger zur Datenakquise (Sicher für dynamisches Skript-Laden)
app.initStart = function()
{
    const splashImg = document.getElementById('splash-logo');
    if (splashImg && app.logoString)
    {
        splashImg.src = app.logoString;
        splashImg.classList.remove('hidden'); 
    }

    if (typeof google !== 'undefined' && google.script && google.script.run)
    {
        google.script.run
            .withSuccessHandler(app.onDataLoaded)
            .withFailureHandler(function(err)
            {
                app.onDataLoaded({ success: false, error: "Netzwerk-Timeout beim Start:\n" + err.toString() });
            })
            .getInitialAppData();
    }
    else
    {
        // Falls im Web/Github-Pages (über API_URL aus config.js):
        if (typeof app.logic !== 'undefined' && typeof app.logic.refreshGlobalAppData === 'function')
        {
            app.logic.refreshGlobalAppData();
        }
        else
        {
            app.onDataLoaded({ success: false, error: "Keine Google Apps Script Umgebung erkannt (Lokal-Modus)." });
        }
    }
};

// Falls DOM bereits geladen ist (bei dynamischen Skripten), sofort ausführen, sonst auf Event warten:
if (document.readyState === 'complete' || document.readyState === 'interactive')
{
    app.initStart();
}
else
{
    document.addEventListener("DOMContentLoaded", app.initStart);
}
