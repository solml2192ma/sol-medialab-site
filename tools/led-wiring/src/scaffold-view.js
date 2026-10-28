import { scaffoldViewData } from './scaffold-view-data.js';
import { config } from './config.js';

document.body.toggleAttribute('data-preview',new URLSearchParams(location.search).get('preview')==='1');

try {
  const response = await fetch('data/pixel.json');
  if (!response.ok) throw new Error('제품 정보를 불러오지 못했습니다. 다시 열어 주세요.');
  const data = scaffoldViewData(new URLSearchParams(location.search),await response.json());
  document.querySelector('#scaffold-error').hidden = true;
  document.querySelector('#scaffold-orbit').hidden = false;
  initOrbit(data);
} catch (error) {
  document.querySelector('#scaffold-error').textContent = error.message;
}

function initOrbit(data) {
  const root = document.getElementById('scaffold-orbit');
  const svg = root.querySelector('svg');
  const [yawControl, pitchControl] = root.querySelectorAll('input[type=range]');
  const topControl = root.querySelector('[data-top]');
  const panelControl = root.querySelector('[data-panel]');
  const W = data.off.widthM * 1000, H = data.off.heightM * 1000, D = data.off.depthM * 1000;
  const panel = data.panel;
  const panelThickness = panel.thicknessMm ?? 0; // 미확정 두께는 임의 수치 대신 평면으로 표현
  let showPanel = data.showPanel;
  panelControl.checked = showPanel;
  const frameH = data.off.tierHeightM * 1000, shortH = data.off.shortPostHeightM * 1000, pinH = data.off.pinExposedM * 1000;
  const angles = document.body.hasAttribute('data-preview') ? config.scaffold.previewAngles : config.scaffold.viewAngles;
  let { yaw, pitch } = angles;
  yawControl.value = yaw;
  pitchControl.value = pitch;
  let top = false, zoom = 1, drag = null;
  const fmt = n => n.toLocaleString('ko-KR');
  top = data.topPlank;
  topControl.checked = top;
  root.querySelector('[data-title]').textContent = '아시바 ' + data.off.bays + '칸 × ' + data.off.displayTiers + '단';
  root.querySelector('[data-size]').textContent = fmt(W) + ' × ' + fmt(H) + ' × ' + fmt(D) + ' mm';
  root.querySelector('[data-led]').textContent = 'LED ' + fmt(data.input.widthMm) + ' × ' + fmt(data.input.heightMm) + ' × ' + (data.pitch.thicknessMm ?? '-') + ' mm 기준';
  if (data.pitch.thicknessNote) root.querySelector('[data-led]').textContent += ` (${data.pitch.thicknessNote})`;
  if(data.off.baseEnabled || data.off.stageEnabled) root.querySelector('[data-led]').textContent += ` · 바닥부터 LED 시작 ${fmt(data.off.ledBottomMm)}mm / 상단 ${fmt(data.off.ledTopMm)}mm (단 ${fmt(data.off.stageHeightMm)} + 베이스 ${fmt(data.off.baseHeightMm)}mm)`;
  root.querySelector('[data-pin]').textContent = '연결핀 노출 높이 ' + pinH + 'mm';
  const installationLegend = root.querySelector('[data-installation-legend]');
  installationLegend.hidden = panel.installationBoxes.length === 0;
  for (const kind of ['stage','base']) {
    const legend = installationLegend.querySelector(`[data-${kind}-legend]`);
    const box = panel.installationBoxes.find(item=>item.kind===kind);
    legend.hidden = !box;
    if(box) legend.querySelector('span').textContent = `${kind==='stage'?'LED 단 (파란색)':'베이스 (노란색)'} · 높이 ${fmt(box.h)}mm`;
  }
  const save = () => {
    const url = new URL(location.href);
    url.searchParams.set('topPlank',top ? '1' : '0');
    url.searchParams.set('showPanel',showPanel ? '1' : '0');
    history.replaceState(null,'',url);
  };
  function draw() {
    const width = Math.max(280, svg.getBoundingClientRect().width);
    const height = svg.getBoundingClientRect().height;
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const rad = Math.PI / 180, a = yaw * rad, b = pitch * rad;
    const supportHeight = Math.max(0,...panel.installationBoxes.map(box=>box.y+box.h));
    const sceneHeight = Math.max(H, supportHeight, showPanel ? panel.offsetY + panel.heightMm : 0);
    const visibleThickness = showPanel || panel.installationBoxes.length ? panelThickness : 0;
    function rotate(p) {
      const x = p[0] - W/2, y = p[1] - sceneHeight/2, z = p[2] - (D-visibleThickness)/2;
      const rx = x*Math.cos(a) + z*Math.sin(a), rz = -x*Math.sin(a) + z*Math.cos(a);
      return [rx, y*Math.cos(b)-rz*Math.sin(b), y*Math.sin(b)+rz*Math.cos(b)];
    }
    const corners=[];
    for(const x of [0,W]) for(const y of [0,H]) for(const z of [0,D]) corners.push(rotate([x,y,z]));
    if(showPanel) for(const x of [panel.offsetX,panel.offsetX+panel.widthMm]) for(const y of [panel.offsetY,panel.offsetY+panel.heightMm]) for(const z of [-panelThickness,0]) corners.push(rotate([x,y,z]));
    for(const box of panel.installationBoxes) for(const x of [box.x,box.x+box.w]) for(const y of [box.y,box.y+box.h]) for(const z of [-box.depthMm,0]) corners.push(rotate([x,y,z]));
    const xs=corners.map(p=>p[0]), ys=corners.map(p=>p[1]);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const scale=Math.min((width-60)/(maxX-minX+400),(height-70)/(maxY-minY+400))*zoom;
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
    const project=p=>{const r=rotate(p);return [width/2+(r[0]-cx)*scale,height/2-(r[1]-cy)*scale,r[2]];};
    const objects=[];
    function tube(p,q,size=4,pin=false) {
      const s=project(p),t=project(q);
      objects.push({depth:(s[2]+t[2])/2,html:`<g><line x1="${s[0]}" y1="${s[1]}" x2="${t[0]}" y2="${t[1]}" stroke="${pin?'var(--orange)':'url(#scaffold-pipe)'}" stroke-width="${size}" stroke-linecap="round"/>${pin?'':`<line x1="${s[0]-.5}" y1="${s[1]-.5}" x2="${t[0]-.5}" y2="${t[1]-.5}" stroke="var(--background)" stroke-opacity=".38" stroke-width="${Math.max(.5,size*.18)}" stroke-linecap="round"/>`}</g>`});
    }
    function face(points,fill,stroke='var(--muted-foreground)',strokeWidth=.6) {
      const pts=points.map(project);
      const item={depth:pts.reduce((s,p)=>s+p[2],0)/pts.length,html:`<polygon points="${pts.map(p=>p.slice(0,2).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`};
      objects.push(item);
      return item;
    }
    function panelRect(x,y,w,h,z,fill,stroke='var(--led-edge)') {
      const points=[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]].map(project);
      return `<polygon points="${points.map(p=>p.slice(0,2).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width=".65"/>`;
    }
    for(const box of panel.installationBoxes) {
      const {x,y,w,h,depthMm}=box, z=-depthMm;
      const color=box.kind==='stage'?'var(--stage-box)':'var(--base-box)';
      const dark=`color-mix(in srgb,${color} 72%,#000)`;
      const light=`color-mix(in srgb,${color} 78%,#fff)`;
      const sides=[
        [[[x,y,z],[x+w,y,z],[x+w,y,0],[x,y,0]],dark],
        [[[x,y+h,z],[x+w,y+h,z],[x+w,y+h,0],[x,y+h,0]],light],
        [[[x,y,z],[x,y+h,z],[x,y+h,0],[x,y,0]],dark],
        [[[x+w,y,z],[x+w,y+h,z],[x+w,y+h,0],[x+w,y,0]],dark],
        [[[x,y,0],[x+w,y,0],[x+w,y+h,0],[x,y+h,0]],color],
        [[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],color],
      ];
      for(const [points,fill] of sides) {
        const item=face(points,fill,dark,.7);
        item.html=`<g data-installation-box="${box.kind}">${item.html}</g>`;
      }
    }
    for(const cabinet of showPanel ? panel.cabinets : []) {
      const {x,y,w,h}=cabinet, z=-panelThickness;
      // 검은 표시 면과 점검 커버가 있는 캐비닛 뒷면을 구분한다.
      face([[x,y,z],[x+w,y,z],[x+w,y,0],[x,y,0]],'var(--led-side)','var(--led-edge)');
      face([[x,y+h,z],[x+w,y+h,z],[x+w,y+h,0],[x,y+h,0]],'var(--led-side)','var(--led-edge)');
      face([[x,y,z],[x,y+h,z],[x,y+h,0],[x,y,0]],'var(--led-side)','var(--led-edge)');
      face([[x+w,y,z],[x+w,y+h,z],[x+w,y+h,0],[x+w,y,0]],'var(--led-side)','var(--led-edge)');
      if(Math.cos(a)>=0) {
        const rear=face([[x,y,0],[x+w,y,0],[x+w,y+h,0],[x,y+h,0]],'var(--led-rear)','var(--led-edge)',.85);
        rear.html+=panelRect(x+w*.21,y+h*.19,w*.58,h*.62,0,'var(--led-cover)');
        for(const side of [.08,.87]) rear.html+=panelRect(x+w*side,y+h*.42,w*.05,h*.16,0,'var(--led-front)');
        for(let vent=0;vent<4;vent++) rear.html+=panelRect(x+w*.32,y+h*(.27+vent*.035),w*.36,h*.012,0,'var(--led-front)','none');
      } else {
        face([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],'var(--led-front)','var(--led-edge)',.55);
      }
    }
    // LED 평면을 기준으로 앞뒤를 분리해 반대편 아시바가 패널을 뚫고 보이지 않게 한다.
    const panelObjects = objects.splice(0);
    function deck(x1,x2,y,selected) {
      const z1=D*.13,z2=D*.87,thickness=38;
      face([[x1,y-thickness,z1],[x2,y-thickness,z1],[x2,y,z1],[x1,y,z1]],'var(--muted-foreground)');
      face([[x1,y-thickness,z2],[x2,y-thickness,z2],[x2,y,z2],[x1,y,z2]],'var(--muted-foreground)');
      face([[x1,y,z1],[x2,y,z1],[x2,y,z2],[x1,y,z2]],selected?'color-mix(in srgb,var(--viz-series-1) 22%,var(--background))':'color-mix(in srgb,var(--muted-foreground) 30%,var(--background))');
      for(let ix=1;ix<18;ix++) for(let iz=1;iz<6;iz++) {
        const p=project([x1+(x2-x1)*ix/18,y+.6,z1+(z2-z1)*iz/6]);
        objects.push({depth:p[2]+1,html:`<ellipse cx="${p[0]}" cy="${p[1]}" rx="${Math.max(.5,scale*9)}" ry="${Math.max(.35,scale*7)}" fill="var(--muted-foreground)" fill-opacity=".65"/>`});
      }
    }
    const normalLevels = Array.from({length:data.off.tiers},(_,i)=>({bottom:i*(frameH+pinH),height:frameH}));
    const levels = [...normalLevels];
    if(data.off.shortPosts) levels.push({bottom:data.off.tiers*(frameH+pinH),height:shortH});
    for(let c=0;c<=data.off.bays;c++) {
      const x=W*c/data.off.bays;
      for(const level of levels) {
        const y=level.bottom, h=level.height;
        for(const z of [0,D]) tube([x,y,z],[x,y+h,z],4.8);
        const rungCount=h===shortH?2:4;
        for(let r=1;r<=rungCount;r++) {
          const ry=y+h*r/(rungCount+1);
          tube([x,ry,0],[x,ry,D],3);
        }
        tube([x,y+h,0],[x,y+h,D],3.6);
        if(y>0) for(const z of [0,D]) tube([x,y-pinH,z],[x,y,z],5,true);
      }
    }
    for(let c=0;c<data.off.bays;c++) {
      const x1=W*c/data.off.bays,x2=W*(c+1)/data.off.bays;
      for(const level of normalLevels) {
        const lo=level.bottom+frameH*.12,hi=level.bottom+frameH*.88;
        for(const z of [0,D]) {
          tube([x1,lo,z],[x2,hi,z],2.1);
          tube([x1,hi,z],[x2,lo,z],2.1);
        }
      }
      const deckLevels=top?levels:levels.slice(0,-1);
      for(let i=0;i<deckLevels.length;i++) {
        const level=deckLevels[i];
        deck(x1+20,x2-20,level.bottom+level.height,top&&i===levels.length-1);
      }
    }
    objects.sort((x,y)=>x.depth-y.depth);
    panelObjects.sort((x,y)=>x.depth-y.depth);
    const orderedObjects = Math.cos(a)>=0 ? [...panelObjects,...objects] : [...objects,...panelObjects];
    svg.innerHTML=`<defs><linearGradient id="scaffold-pipe" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="${height}"><stop stop-color="var(--muted-foreground)"/><stop offset=".4" stop-color="color-mix(in srgb,var(--foreground) 65%,var(--background))"/><stop offset=".6" stop-color="var(--muted-foreground)"/><stop offset="1" stop-color="var(--foreground)"/></linearGradient></defs>${orderedObjects.map(o=>o.html).join('')}`;
    root.querySelector('[data-angle]').textContent=`${Math.round(yaw)}°`;
    root.querySelector('[data-pitch-angle]').textContent=`${Math.round(pitch)}°`;
    const s=top?data.on:data.off;
    root.querySelector('[data-counts]').textContent=`기둥 ${s.posts} · 짧은기둥 ${s.shortPosts} · 핀 ${s.pins} · X바 ${s.xBars} · 발판 ${s.planks}`;
    const panelDescription = showPanel ? `LED ${fmt(panel.widthMm)} × ${fmt(panel.heightMm)}mm 패널 ${panel.cabinets.length}개가 전면에 설치된 ` : 'LED 패널 없이 표시한 ';
    svg.setAttribute('aria-label',`${panelDescription}아시바 ${fmt(W)} × ${fmt(H)} × ${fmt(D)}mm, ${s.bays}칸 ${s.displayTiers}단, 발판 ${s.planks}개, 좌우 회전 ${Math.round(yaw)}도, 위아래 시점 ${Math.round(pitch)}도`);
  }
  yawControl.addEventListener('input',()=>{yaw=+yawControl.value;draw();});
  pitchControl.addEventListener('input',()=>{pitch=+pitchControl.value;draw();});
  for(const control of [yawControl,pitchControl]) control.addEventListener('change',save);
  topControl.addEventListener('change',()=>{top=topControl.checked;draw();save();});
  panelControl.addEventListener('change',()=>{showPanel=panelControl.checked;draw();save();});
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,yaw,pitch};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!drag)return;yaw=((drag.yaw+(e.clientX-drag.x)*.45)%360+360)%360;pitch=Math.max(-15,Math.min(70,drag.pitch+(e.clientY-drag.y)*.3));yawControl.value=yaw;pitchControl.value=pitch;draw();});
  svg.addEventListener('pointerup',()=>{if(drag){drag=null;save();}});
  svg.addEventListener('pointercancel',()=>{drag=null;});
  new ResizeObserver(draw).observe(svg);
  new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});
  draw();
}
