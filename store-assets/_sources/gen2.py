BG_TOP="#0F1B0E"; BG_BOT="#0B0E0B"; SURF="#16191F"; ELEV="#1F232B"; BORDER="#2A2E37"
TEXT="#F2F4F7"; DIM="#9AA1AC"; MUTED="#6B7280"; GREEN="#3DDC97"; GREEN2="#5CFFB0"
GOLD="#F4B940"; DANGER="#EF4444"; BLUE="#7CC8FF"; BG="#0F1115"; INK="#0B0E0B"
FONT="'Helvetica Neue','Arial',sans-serif"; MONO="'Menlo','Courier New',monospace"
def defs():
    return f'''<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="{BG_TOP}"/><stop offset="0.5" stop-color="{BG_BOT}"/><stop offset="1" stop-color="#0A0C0A"/></linearGradient>
    <radialGradient id="aura" cx="50%" cy="8%" r="60%"><stop offset="0" stop-color="{GREEN}" stop-opacity="0.20"/><stop offset="1" stop-color="{GREEN}" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="softglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="26" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'''
def frame(c,W=1290,H=2796):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{defs()}<rect width="{W}" height="{H}" fill="url(#bg)"/><rect width="{W}" height="{H}" fill="url(#aura)"/>{c}</svg>'
def card(x,y,w,h,fill=SURF,stroke=BORDER,rx=28,sw=2):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
def tile(x,y,s,fill,stroke=None,letter=None,lc=INK,fs=None):
    r=s*0.16
    b=f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="3"' if stroke else '')+'/>'
    t=''
    if letter:
        fs=fs or int(s*0.5)
        t=f'<text x="{x+s/2}" y="{y+s/2+fs*0.35}" font-family="{FONT}" font-weight="800" font-size="{fs}" fill="{lc}" text-anchor="middle">{letter}</text>'
    return b+t
def caption(cx,h,sub):
    return (f'<text x="{cx}" y="230" font-family="{FONT}" font-weight="800" font-size="86" fill="{TEXT}" text-anchor="middle" letter-spacing="-1">{h}</text>'
            f'<text x="{cx}" y="320" font-family="{MONO}" font-size="34" fill="{GREEN}" text-anchor="middle" letter-spacing="3">{sub}</text>')
W=1290; CX=W/2; PY=440; PB=2736; PANEL=(60,PY,W-120,PB-PY)

def colmap(k): return {"g":GREEN,"y":GOLD,"x":ELEV,"e":"none"}[k]

# ---- MATCH (fuller) ----
s=[caption(CX,"Same word. Six guesses.","FASTEST SOLVER WINS")]
s.append(card(60,PY,W-120,PB-PY,fill=BG,rx=52))
s.append(f'<text x="150" y="{PY+110}" font-family="{MONO}" font-size="26" fill="{GREEN}" letter-spacing="2">YOU</text>')
s.append(f'<text x="{CX}" y="{PY+128}" font-family="{MONO}" font-weight="700" font-size="72" fill="{TEXT}" text-anchor="middle" letter-spacing="4">01:12</text>')
s.append(f'<text x="{W-150}" y="{PY+110}" font-family="{MONO}" font-size="26" fill="{DANGER}" letter-spacing="2" text-anchor="end">NEMESIS</text>')
# opponent mini board label + tiny grid
s.append(f'<text x="{CX}" y="{PY+220}" font-family="{MONO}" font-size="24" fill="{DIM}" text-anchor="middle" letter-spacing="2">NEMESIS’S BOARD</text>')
mts=44; mgap=8; mcols=5; mgw=mcols*mts+(mcols-1)*mgap; mx0=CX-mgw/2; my0=PY+250
oppro=[["g","x","y","x","g"],["x","g","x","g","g"]]
for r,row in enumerate(oppro):
    for c,k in enumerate(row):
        s.append(tile(mx0+c*(mts+mgap),my0+r*(mts+mgap),mts,colmap(k) if k!="e" else BG,BORDER if k=="e" else None))
# main grid
ts=150; gap=20; cols=5; gw=cols*ts+(cols-1)*gap; gx0=CX-gw/2; gy0=PY+420
rows=[[("C","g"),("R","x"),("A","y"),("N","x"),("E","g")],[("S","x"),("T","g"),("A","y"),("R","g"),("E","g")],[("","e")]*5,[("","e")]*5]
for r,row in enumerate(rows):
    for c,(ch,k) in enumerate(row):
        x=gx0+c*(ts+gap); y=gy0+r*(ts+gap)
        lc=INK if k in("g","y") else TEXT
        s.append(tile(x,y,ts,colmap(k) if k!="e" else BG,BORDER if k=="e" else None,ch or None,lc,int(ts*0.5)))
# powerup bar
pby=gy0+4*(ts+gap)+30
pw=(gw-2*24)/3
for i,(lbl,c,n) in enumerate([("REVEAL",GREEN,"2"),("SCRAMBLE",GOLD,"1"),("LOCK",BLUE,"3")]):
    px=gx0+i*(pw+24)
    s.append(card(px,pby,pw,96,fill=ELEV,stroke=c+"55",rx=48))
    s.append(f'<text x="{px+pw/2-24}" y="{pby+60}" font-family="{MONO}" font-size="26" fill="{TEXT}" text-anchor="middle" letter-spacing="1">{lbl}</text>')
    s.append(f'<circle cx="{px+pw-46}" cy="{pby+48}" r="26" fill="{c}"/>')
    s.append(f'<text x="{px+pw-46}" y="{pby+58}" font-family="{MONO}" font-weight="700" font-size="28" fill="{INK}" text-anchor="middle">{n}</text>')
# keyboard
ky=pby+150
kb=["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"]
kst={"C":GREEN,"R":GOLD,"S":GREEN,"T":GREEN,"A":GOLD,"E":GREEN,"N":ELEV}
for r,rowk in enumerate(kb):
    kw=100; kgap=14
    if r==1: kw=100
    total=len(rowk)*kw+(len(rowk)-1)*kgap; kx0=CX-total/2
    for c,ch in enumerate(rowk):
        x=kx0+c*(kw+kgap); y=ky+r*(128)
        fill=kst.get(ch,ELEV); lc=INK if fill in(GREEN,GOLD) else TEXT
        s.append(f'<rect x="{x}" y="{y}" width="{kw}" height="112" rx="16" fill="{fill}"/>')
        s.append(f'<text x="{x+kw/2}" y="{y+74}" font-family="{FONT}" font-weight="700" font-size="46" fill="{lc}" text-anchor="middle">{ch}</text>')
open("shot2_match.svg","w").write(frame("".join(s)))

# ---- VICTORY (fuller: add boards + actions) ----
s=[caption(CX,"Climb the ranks.","EVERY WIN COUNTS")]
s.append(card(60,PY,W-120,PB-PY,fill=BG,rx=52))
s.append(f'<text x="{CX}" y="{PY+250}" font-family="{FONT}" font-weight="800" font-size="150" fill="{GREEN}" text-anchor="middle" filter="url(#softglow)" letter-spacing="2">SOLVED!</text>')
s.append(f'<text x="{CX}" y="{PY+330}" font-family="{MONO}" font-size="34" fill="{DIM}" text-anchor="middle">You defeated <tspan fill="{DANGER}">x_hacker_99</tspan></text>')
ex=120; ew=W-240; ey=PY+400
s.append(card(ex,ey,ew,300,stroke=GREEN))
s.append(f'<text x="{ex+48}" y="{ey+88}" font-family="{MONO}" font-size="34" fill="{TEXT}">GOLD · 1560 RP</text>')
s.append(f'<text x="{ex+ew-48}" y="{ey+88}" font-family="{MONO}" font-weight="700" font-size="50" fill="{GREEN}" text-anchor="end">+25 Elo</text>')
s.append(f'<rect x="{ex+48}" y="{ey+130}" width="{ew-96}" height="18" rx="9" fill="{ELEV}"/><rect x="{ex+48}" y="{ey+130}" width="{(ew-96)*0.62}" height="18" rx="9" fill="{GREEN}"/>')
s.append(f'<text x="{ex+48}" y="{ey+230}" font-family="{MONO}" font-size="34" fill="{GOLD}">+5 coins</text>')
s.append(f'<text x="{ex+ew/2}" y="{ey+230}" font-family="{MONO}" font-size="34" fill="{BLUE}" text-anchor="middle">+60 XP</text>')
s.append(f'<text x="{ex+ew-48}" y="{ey+230}" font-family="{MONO}" font-size="34" fill="{DIM}" text-anchor="end">2m 14s</text>')
# word reveal
wy=ey+370
s.append(card(ex,wy,ew,180,rx=28))
s.append(f'<text x="{CX}" y="{wy+62}" font-family="{MONO}" font-size="26" fill="{DIM}" text-anchor="middle" letter-spacing="3">THE WORD WAS</text>')
s.append(f'<text x="{CX}" y="{wy+140}" font-family="{MONO}" font-weight="700" font-size="70" fill="{TEXT}" text-anchor="middle" letter-spacing="10">CRANE</text>')
# boards You vs Opponent
byy=wy+250
def board(lbl,lc,rowsb,x0):
    o=[f'<text x="{x0+ (ew/2-20)/2}" y="{byy}" font-family="{MONO}" font-size="26" fill="{lc}" text-anchor="middle" letter-spacing="2">{lbl}</text>']
    bts=48; bgap=8; bw=5*bts+4*bgap; bx=x0+((ew/2-20)-bw)/2; by0=byy+30
    for r,row in enumerate(rowsb):
        for c,k in enumerate(row):
            o.append(tile(bx+c*(bts+bgap),by0+r*(bts+bgap),bts,colmap(k) if k!="e" else BG,BORDER if k=="e" else None))
    return "".join(o)
s.append(board("YOU",GREEN,[["g","x","y","x","g"],["g","g","g","g","g"]],ex))
s.append(board("OPPONENT",DANGER,[["x","g","x","g","x"],["x","x","y","g","g"]],ex+ew/2+20))
# rematch
ry=byy+220
s.append(f'<rect x="{ex}" y="{ry}" width="{ew}" height="150" rx="40" fill="{GREEN}" filter="url(#glow)"/>')
s.append(f'<text x="{CX}" y="{ry+98}" font-family="{FONT}" font-weight="800" font-size="56" fill="{INK}" text-anchor="middle" letter-spacing="2">REMATCH</text>')
# share/menu
sy=ry+190; hw=(ew-24)/2
for i,(lbl) in enumerate(["SHARE","MENU"]):
    sx=ex+i*(hw+24)
    s.append(card(sx,sy,hw,120,fill=ELEV,rx=32))
    s.append(f'<text x="{sx+hw/2}" y="{sy+76}" font-family="{FONT}" font-weight="700" font-size="40" fill="{TEXT}" text-anchor="middle" letter-spacing="1">{lbl}</text>')
open("shot3_victory.svg","w").write(frame("".join(s)))
print("regenerated shot2, shot3")
