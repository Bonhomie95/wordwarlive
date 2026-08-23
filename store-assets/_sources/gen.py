# Generates store screenshot + feature-graphic SVGs (neon WordWar design).
BG_TOP="#0F1B0E"; BG_BOT="#0B0E0B"; SURF="#16191F"; ELEV="#1F232B"; BORDER="#2A2E37"
TEXT="#F2F4F7"; DIM="#9AA1AC"; MUTED="#6B7280"; GREEN="#3DDC97"; GREEN2="#5CFFB0"
GOLD="#F4B940"; DANGER="#EF4444"; BG="#0F1115"; INK="#0B0E0B"
FONT="'Helvetica Neue','Arial',sans-serif"; MONO="'Menlo','Courier New',monospace"

def defs():
    return f'''<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="{BG_TOP}"/><stop offset="0.5" stop-color="{BG_BOT}"/><stop offset="1" stop-color="#0A0C0A"/>
    </linearGradient>
    <radialGradient id="aura" cx="50%" cy="8%" r="60%">
      <stop offset="0" stop-color="{GREEN}" stop-opacity="0.20"/><stop offset="1" stop-color="{GREEN}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{GREEN2}"/><stop offset="1" stop-color="#2FCB86"/></linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="softglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="26" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>'''

def wordmark(cx, y, size):
    # "Word" white + "War" green, heavy
    return (f'<text x="{cx}" y="{y}" font-family="{FONT}" font-weight="800" font-size="{size}" '
            f'text-anchor="middle" letter-spacing="-1"><tspan fill="{TEXT}">Word</tspan>'
            f'<tspan fill="{GREEN}">War</tspan></text>')

def tile(x,y,s,fill,stroke=None,letter=None,lc=INK,fs=None):
    r=s*0.16
    body=(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{r}" fill="{fill}"'
          + (f' stroke="{stroke}" stroke-width="3"' if stroke else '') + '/>')
    txt=''
    if letter:
        fs=fs or int(s*0.5)
        txt=(f'<text x="{x+s/2}" y="{y+s/2+fs*0.35}" font-family="{FONT}" font-weight="800" '
             f'font-size="{fs}" fill="{lc}" text-anchor="middle">{letter}</text>')
    return body+txt

def caption(cx, headline, sub, W):
    return (f'<text x="{cx}" y="230" font-family="{FONT}" font-weight="800" font-size="86" '
            f'fill="{TEXT}" text-anchor="middle" letter-spacing="-1">{headline}</text>'
            f'<text x="{cx}" y="320" font-family="{MONO}" font-size="34" fill="{GREEN}" '
            f'text-anchor="middle" letter-spacing="3">{sub}</text>')

def frame(content, W=1290, H=2796):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'{defs()}<rect width="{W}" height="{H}" fill="url(#bg)"/><rect width="{W}" height="{H}" fill="url(#aura)"/>'
            f'{content}</svg>')

def card(x,y,w,h,fill=SURF,stroke=BORDER,rx=28):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'

W=1290; CX=W/2

# ---------- Screenshot 1: HOME ----------
s=[]
s.append(caption(CX,"Race. Solve. Win.","REAL-TIME 1V1 WORD DUELS",W))
# screen panel
py=440
s.append(f'<rect x="60" y="{py}" width="{W-120}" height="{2796-py-60}" rx="52" fill="{BG}" stroke="{BORDER}" stroke-width="2"/>')
# top bar wordmark
s.append(wordmark(CX, py+120, 64))
# rank card
rx0=120; rw=W-240
s.append(card(rx0, py+200, rw, 300, fill=SURF, stroke=GREEN))
s.append(f'<text x="{rx0+48}" y="{py+280}" font-family="{MONO}" font-size="26" fill="{DIM}" letter-spacing="3">CURRENT RANK</text>')
s.append(f'<text x="{rx0+48}" y="{py+352}" font-family="{FONT}" font-weight="800" font-size="66" fill="{TEXT}">GOLD</text>')
s.append(f'<rect x="{rx0+48}" y="{py+392}" width="{rw-96}" height="16" rx="8" fill="{ELEV}"/>')
s.append(f'<rect x="{rx0+48}" y="{py+392}" width="{(rw-96)*0.62}" height="16" rx="8" fill="{GREEN}"/>')
s.append(f'<text x="{rx0+48}" y="{py+452}" font-family="{MONO}" font-size="28" fill="{GREEN}">1560 RP</text>')
# stat tiles
sy=py+560; sw=(rw-2*24)/3
for i,(v,l,c) in enumerate([("2.4","W/L RATIO",GREEN),("7","WIN STREAK",GOLD),("63%","WIN RATE","#7CC8FF")]):
    sx=rx0+i*(sw+24)
    s.append(card(sx,sy,sw,220,rx=24))
    s.append(f'<text x="{sx+sw/2}" y="{sy+120}" font-family="{MONO}" font-weight="700" font-size="60" fill="{TEXT}" text-anchor="middle">{v}</text>')
    s.append(f'<text x="{sx+sw/2}" y="{sy+170}" font-family="{MONO}" font-size="22" fill="{MUTED}" text-anchor="middle" letter-spacing="1">{l}</text>')
# PLAY button
by=sy+300
s.append(f'<rect x="{rx0}" y="{by}" width="{rw}" height="300" rx="44" fill="{GREEN}" filter="url(#softglow)"/>')
s.append(f'<polygon points="{CX-42},{by+90} {CX-42},{by+186} {CX+50},{by+138}" fill="{INK}"/>')
s.append(f'<text x="{CX}" y="{by+250}" font-family="{FONT}" font-weight="800" font-size="72" fill="{INK}" text-anchor="middle" letter-spacing="4">PLAY</text>')
open("shot1_home.svg","w").write(frame("".join(s)))

# ---------- Screenshot 2: MATCH ----------
s=[]
s.append(caption(CX,"Same word. Six guesses.","FASTEST SOLVER WINS",W))
py=440
s.append(f'<rect x="60" y="{py}" width="{W-120}" height="{2796-py-60}" rx="52" fill="{BG}" stroke="{BORDER}" stroke-width="2"/>')
# header YOU / timer / NEMESIS
s.append(f'<text x="180" y="{py+110}" font-family="{MONO}" font-size="26" fill="{GREEN}" letter-spacing="2">YOU</text>')
s.append(f'<text x="{CX}" y="{py+130}" font-family="{MONO}" font-weight="700" font-size="76" fill="{TEXT}" text-anchor="middle" letter-spacing="4">01:12</text>')
s.append(f'<text x="{W-180}" y="{py+110}" font-family="{MONO}" font-size="26" fill="{DANGER}" letter-spacing="2" text-anchor="end">NEMESIS</text>')
# grid
gx=W/2; ts=150; gap=20; cols=5; gw=cols*ts+(cols-1)*gap; gx0=CX-gw/2; gy0=py+200
rows=[[("C","g"),("R","x"),("A","y"),("N","x"),("E","g")],
      [("S","x"),("T","g"),("A","y"),("R","g"),("E","g")],
      [("","e")]*5,[("","e")]*5]
def col(kind):
    return {"g":GREEN,"y":GOLD,"x":ELEV,"e":"none"}[kind]
for r,row in enumerate(rows):
    for c,(ch,kind) in enumerate(row):
        x=gx0+c*(ts+gap); y=gy0+r*(ts+gap)
        fill=col(kind); stroke=BORDER if kind=="e" else None
        lc=INK if kind in("g","y") else TEXT
        s.append(tile(x,y,ts,fill if fill!="none" else BG,stroke,ch if ch else None,lc,int(ts*0.5)))
# keyboard hint (3 rows of small keys)
ky=gy0+4*(ts+gap)+40
kb=["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"]
for r,rowk in enumerate(kb):
    kw=64; kgap=12; total=len(rowk)*kw+(len(rowk)-1)*kgap; kx0=CX-total/2
    for c,ch in enumerate(rowk):
        x=kx0+c*(kw+kgap); y=ky+r*(92)
        s.append(f'<rect x="{x}" y="{y}" width="{kw}" height="80" rx="12" fill="{ELEV}"/>')
        s.append(f'<text x="{x+kw/2}" y="{y+54}" font-family="{FONT}" font-weight="700" font-size="34" fill="{TEXT}" text-anchor="middle">{ch}</text>')
open("shot2_match.svg","w").write(frame("".join(s)))

# ---------- Screenshot 3: VICTORY ----------
s=[]
s.append(caption(CX,"Climb the ranks.","EVERY WIN COUNTS",W))
py=440
s.append(f'<rect x="60" y="{py}" width="{W-120}" height="{2796-py-60}" rx="52" fill="{BG}" stroke="{BORDER}" stroke-width="2"/>')
s.append(f'<text x="{CX}" y="{py+300}" font-family="{FONT}" font-weight="800" font-size="150" fill="{GREEN}" text-anchor="middle" filter="url(#softglow)" letter-spacing="2">SOLVED!</text>')
s.append(f'<text x="{CX}" y="{py+380}" font-family="{MONO}" font-size="34" fill="{DIM}" text-anchor="middle">You defeated <tspan fill="{DANGER}">x_hacker_99</tspan></text>')
# elo card
ex=120; ew=W-240; ey=py+470
s.append(card(ex,ey,ew,360,stroke=GREEN))
s.append(f'<text x="{ex+48}" y="{ey+90}" font-family="{MONO}" font-size="34" fill="{TEXT}">GOLD · 1560 RP</text>')
s.append(f'<text x="{ex+ew-48}" y="{ey+90}" font-family="{MONO}" font-weight="700" font-size="52" fill="{GREEN}" text-anchor="end">+25 Elo</text>')
s.append(f'<rect x="{ex+48}" y="{ey+140}" width="{ew-96}" height="18" rx="9" fill="{ELEV}"/>')
s.append(f'<rect x="{ex+48}" y="{ey+140}" width="{(ew-96)*0.62}" height="18" rx="9" fill="{GREEN}"/>')
s.append(f'<text x="{ex+48}" y="{ey+250}" font-family="{MONO}" font-size="34" fill="{GOLD}">+5 coins</text>')
s.append(f'<text x="{ex+ew/2}" y="{ey+250}" font-family="{MONO}" font-size="34" fill="#7CC8FF" text-anchor="middle">+60 XP</text>')
s.append(f'<text x="{ex+ew-48}" y="{ey+250}" font-family="{MONO}" font-size="34" fill="{DIM}" text-anchor="end">2m 14s</text>')
# rematch button
by=ey+440
s.append(f'<rect x="{ex}" y="{by}" width="{ew}" height="150" rx="40" fill="{GREEN}" filter="url(#glow)"/>')
s.append(f'<text x="{CX}" y="{by+98}" font-family="{FONT}" font-weight="800" font-size="56" fill="{INK}" text-anchor="middle" letter-spacing="2">REMATCH</text>')
open("shot3_victory.svg","w").write(frame("".join(s)))

# ---------- Screenshot 4: MODES ----------
s=[]
s.append(caption(CX,"Four ways to play.","CLASSIC · MYSTERY · DAILY · FRIENDS",W))
py=440
s.append(f'<rect x="60" y="{py}" width="{W-120}" height="{2796-py-60}" rx="52" fill="{BG}" stroke="{BORDER}" stroke-width="2"/>')
modes=[("▶","Classic Ranked","Race the same word, 1v1",GREEN),
       ("◉","Mystery Duel","Crack each other’s word",GOLD),
       ("▦","Daily Challenge","One word. Whole world.","#7CC8FF"),
       ("❤","Friends","Private live matches",DANGER)]
mx=120; mw=W-240; my=py+180; mh=340
for i,(ic,t,d,c) in enumerate(modes):
    y=my+i*(mh+40)
    s.append(card(mx,y,mw,mh,rx=36))
    s.append(f'<circle cx="{mx+140}" cy="{y+mh/2}" r="78" fill="{ELEV}" stroke="{c}" stroke-width="3"/>')
    s.append(f'<text x="{mx+140}" y="{y+mh/2+30}" font-family="{FONT}" font-size="76" fill="{c}" text-anchor="middle">{ic}</text>')
    s.append(f'<text x="{mx+270}" y="{y+mh/2-6}" font-family="{FONT}" font-weight="800" font-size="60" fill="{TEXT}">{t}</text>')
    s.append(f'<text x="{mx+270}" y="{y+mh/2+64}" font-family="{MONO}" font-size="34" fill="{DIM}">{d}</text>')
open("shot4_modes.svg","w").write(frame("".join(s)))

# ---------- Feature graphic (Play) 1024x500 ----------
FW=1024; FH=500
s=[f'<rect width="{FW}" height="{FH}" fill="url(#bg)"/><rect width="{FW}" height="{FH}" fill="url(#aura)"/>']
# W mark left
s.append('<g transform="translate(150,250) scale(0.42) translate(-512,-512)">')
s.append(f'<path d="M300 320 L410 636 L512 454 L614 636 L724 320" fill="none" stroke="url(#wg)" stroke-width="108" stroke-linejoin="round" stroke-linecap="round" filter="url(#softglow)"/></g>')
s.append(f'<text x="470" y="235" font-family="{FONT}" font-weight="800" font-size="120" letter-spacing="-2"><tspan fill="{TEXT}">Word</tspan><tspan fill="{GREEN}">War</tspan></text>')
s.append(f'<text x="472" y="310" font-family="{MONO}" font-size="34" fill="{DIM}" letter-spacing="4">REAL-TIME 1V1 WORD DUELS</text>')
# mini tiles
for i,(f,st) in enumerate([(GREEN,None),(ELEV,BORDER),(GOLD,None),(ELEV,BORDER),(GREEN,None)]):
    s.append(tile(472+i*72,360,58,f if f!=ELEV else BG, st))
open("feature.svg","w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{FW}" height="{FH}" viewBox="0 0 {FW} {FH}">{defs()}{"".join(s)}</svg>')
print("SVGs written")
