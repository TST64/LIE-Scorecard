<style>
/* Individuelle UI/UX-Optimierungen über Tailwind hinaus */

/* Deaktiviert die unschöne graue Fläche beim Tippen auf Mobilgeräten */
button, a, .nav-btn 
{
    -webkit-tap-highlight-color: transparent;
    outline: none;
}

/* Weiche Übergänge für View-Wechsel */
#app-container 
{
    transition: opacity 0.2s ease-in-out;
}

/* One-Hand Safe Input States */
.touch-target 
{
    min-height: 44px;
    min-width: 44px;
}
</style>