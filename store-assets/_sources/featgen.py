TEXT="#F2F4F7"; DIM="#9AA1AC"; GREEN="#3DDC97"; GREEN2="#5CFFB0"; GOLD="#F4B940"; ELEV="#1F232B"; BORDER="#2A2E37"; BG="#0F1115"
FONT="'Helvetica Neue','Arial',sans-serif"; MONO="'Menlo','Courier New',monospace"
FW,FH=1024,500
defs=f'''<defs>
 <linearGradient id="bg" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="#0F1B0E"/><stop offset="0.55" stop-color="#0B0E0B"/><stop offset="1" stop-color="#0A0C0A"/></linearGradient>
 <radialGradient id="aura" cx="18%" cy="45%" r="55%"><stop offset="0" stop-color="{GREEN}" stop-opacity="0.22"/><stop offset="1" stop-color="{GREEN}" stop-opacity="0"/></radialGradient>
 <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{GREEN2}"/><stop offset="1" stop-color="#2FCB86"/></linearGradient>
 <filter id="sg" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="22" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'''
s=[f'<rect width="{FW}" height="{FH}" fill="url(#bg)"/><rect width="{FW}" height="{FH}" fill="url(#aura)"/>']
# W mark left, vertically centered
s.append('<g transform="translate(60,60) scale(0.36)">')
s.append(f'<path d="M300 320 L410 636 L512 454 L614 636 L724 320" fill="none" stroke="url(#wg)" stroke-width="112" stroke-linejoin="round" stroke-linecap="round" filter="url(#sg)"/></g>')
# text block
tx=430
s.append(f'<text x="{tx}" y="228" font-family="{FONT}" font-weight="800" font-size="104" letter-spacing="-2"><tspan fill="{TEXT}">Word</tspan><tspan fill="{GREEN}">War</tspan></text>')
s.append(f'<text x="{tx+4}" y="292" font-family="{MONO}" font-size="26" fill="{DIM}" letter-spacing="3">REAL-TIME 1V1 WORD DUELS</text>')
# tiles
for i,(f,st) in enumerate([(GREEN,None),(ELEV,BORDER),(GOLD,None),(ELEV,BORDER),(GREEN,None)]):
    x=tx+4+i*70; y=330; sz=54; r=sz*0.18
    fill=f if f!=ELEV else BG
    s.append(f'<rect x="{x}" y="{y}" width="{sz}" height="{sz}" rx="{r}" fill="{fill}"'+(f' stroke="{st}" stroke-width="3"' if st else '')+'/>')
open("feature.svg","w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{FW}" height="{FH}" viewBox="0 0 {FW} {FH}">{defs}{"".join(s)}</svg>')
print("feature regenerated")
