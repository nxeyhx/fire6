(()=>{"use strict";

const $=id=>document.getElementById(id);
const sensorIds=Object.keys(SIM_MAP.sensors);
const exitIds=Object.keys(SIM_MAP.exits);
const horizons=["0","10","20","30"];

const state={
  activeTab:"simulation",
  selectionMode:"normal",
  startZone:null,
  fireZone:null,
  simElapsed:0,
  simRunning:false,
  simBusy:false,
  simTimer:null,
  simIntervalMs:1000,
  values:{"0":{},"10":{},"20":{},"30":{}},
  routes:{},
  models:{},
  modelSource:"준비 중",
  modelReady:false,
  inferenceCount:0,
  lastInference:null,
  verification:"대기",
  actualTimer:null,
  actualPayload:null,
  actualStart:null,
  actualSelectionMode:false,
  actualValues:{"0":{},"10":{},"20":{},"30":{}},
  actualRoutes:{},
  actualModels:{},
  actualModelReady:false,
  actualInferenceCount:0,
  actualLastInference:null,
  actualFlameWasOn:false,
  actualIgnitionSensor:null,
  actualFlameBaseline:{},
  actualPreviousRaw:{},
  actualDetectionStartedAt:null,
  actualIgnitionDetectedAt:null,
  actualAlcoholThreshold:20, // 수정: 알코올 위험 기준값 (20 이상 주황색)
  actualRiseThreshold:5      // 수정: 기준값 대비 상승폭
};


const ACTUAL_MAP={
  points:{
    A1:{x:46.8,y:14.8},
    A2:{x:27.0,y:38.7},
    A3:{x:12.1,y:50.8},
    A4:{x:43.0,y:62.8}
  },
  exits:{
    E1:{x:46.8,y:4.0,label:"출구 1"},
    E2:{x:46.5,y:85.0,label:"출구 2"},
    E3:{x:3.4,y:44.0,label:"출구 3"}
  },
  edges:[
    ["E1","A1"],
    ["A1","A2"],
    ["A2","A3"],
    ["A2","A4"],
    ["A3","E3"],
    ["A4","E2"]
  ],
  routes:{
    "A1|E1":[{x:46.8,y:14.8},{x:46.8,y:4.0}],
    "A1|A2":[{x:46.8,y:14.8},{x:46.8,y:38.7},{x:27.0,y:38.7}],
    "A2|A3":[{x:27.0,y:38.7},{x:12.1,y:38.7},{x:12.1,y:50.8}],
    "A2|A4":[{x:27.0,y:38.7},{x:46.5,y:38.7},{x:46.5,y:62.8},{x:43.0,y:62.8}],
    "A3|E3":[{x:12.1,y:50.8},{x:12.1,y:44.0},{x:3.4,y:44.0}],
    "A4|E2":[{x:43.0,y:62.8},{x:46.5,y:62.8},{x:46.5,y:85.0}]
  }
};

const actualPointMarkers={};
const actualExitMarkers={};
let actualStartMarker=null;
let actualFireMarker=null;
const sensorMarkers={};
const exitMarkers={};
const sensorCards={};
let startMarker=null;
let fireMarker=null;

// 시뮬레이션용 색상 기준 (그대로 유지)
function riskColor(value){
  if(value<25)return"#2eaa70";
  if(value<50)return"#ddb02f";
  if(value<80)return"#e57d35";
  return"#d43d3d";
}

// 수정: 실제 구현 탭 전용 색상 함수 (10미만 안전, 10이상 주의, 20이상 위험, 25이상 매우 위험)
function actualRiskColor(value){
  if(value<10)return"#2eaa70"; // 10 미만: 안전 (초록)
  if(value<20)return"#ddb02f"; // 10 이상 20 미만: 주의 (노랑)
  if(value<25)return"#e57d35"; // 20 이상 25 미만: 위험 (주황)
  return"#d43d3d";             // 25 이상: 매우 위험 (빨강)
}

function setGlobal(status,text){
  const badge=$("globalBadge");
  badge.textContent=status;
  badge.className="badge "+(
    status==="LIVE"?"live":
    status==="주의"?"warn":
    status==="오류"?"error":"standby"
  );
  $("globalStatusText").textContent=text;
}

function setSimMessage(text,type=""){
  $("simMessage").textContent=text;
  $("simMessage").className="message "+type;
}

function setActualMessage(text,type=""){
  $("actualMessage").textContent=text;
  $("actualMessage").className="message "+type;
}

function buildSimulationUi(){
  sensorIds.forEach(id=>{
    const position=SIM_MAP.sensors[id];

    const button=document.createElement("button");
    button.className="sensorMarker";
    button.dataset.sensorId=id;
    button.textContent=id.slice(1);
    button.title=id+" 선택";
    button.style.left=position.x+"%";
    button.style.top=position.y+"%";
    button.addEventListener("click",event=>{
      event.stopPropagation();
      handleSensorSelection(id);
    });
    $("sensorLayer").appendChild(button);
    sensorMarkers[id]=button;

    const card=document.createElement("div");
    card.className="sensorValue";
    card.innerHTML=`<strong>${id}</strong><span>0.0</span>`;
    $("sensorValueGrid").appendChild(card);
    sensorCards[id]=card;
  });

  exitIds.forEach(id=>{
    const position=SIM_MAP.exits[id];
    const marker=document.createElement("div");
    marker.className="exitMarker";
    marker.textContent=id;
    marker.style.left=position.x+"%";
    marker.style.top=position.y+"%";
    $("exitLayer").appendChild(marker);
    exitMarkers[id]=marker;
  });

  ["A1","A2","A3","A4"].forEach((id,index)=>{
    const card=document.createElement("div");
    card.className="actualSensor";
    card.id="actual-"+id;
    card.innerHTML=`<span>${id}</span><strong>0.0</strong><small>맵 ${index+1} 위치</small>`;
    $("actualSensorGrid").appendChild(card);

    const p=ACTUAL_MAP.points[id];
    const marker=document.createElement("button");
    marker.className="actualSensorPoint";
    marker.dataset.actualId=id;
    marker.style.left=p.x+"%";
    marker.style.top=p.y+"%";
    marker.innerHTML=`${index+1}<small>${id}</small>`;
    marker.addEventListener("click",()=>{
      if(state.actualSelectionMode){
        selectActualStart(id);
      }
    });
    $("actualPointLayer").appendChild(marker);
    actualPointMarkers[id]=marker;
  });

  Object.entries(ACTUAL_MAP.exits).forEach(([id,p])=>{
    const marker=document.createElement("div");
    marker.className="actualExitGlow";
    marker.id="actual-exit-"+id;
    marker.style.left=p.x+"%";
    marker.style.top=p.y+"%";
    marker.textContent=p.label;
    $("actualExitLayer").appendChild(marker);
    actualExitMarkers[id]=marker;
  });
}

function switchTab(tab){
  state.activeTab=tab;
  const sim=tab==="simulation";
  $("simulationPane").classList.toggle("active",sim);
  $("actualPane").classList.toggle("active",!sim);
  $("tabSimulation").classList.toggle("active",sim);
  $("tabActual").classList.toggle("active",!sim);
  if(!sim)setSelectionMode("normal");
}

function setSelectionMode(mode){
  state.selectionMode=mode;
  const labels={
    normal:"일반",
    start:"내 위치 선택",
    fire:"발화 위치 선택"
  };
  $("selectionMode").textContent=labels[mode];
  document.body.classList.toggle("selectionActive",mode!=="normal");

  if(mode==="start"){
    setSimMessage("지도에서 내 위치가 될 복도 센서를 클릭하세요.","warn");
  }else if(mode==="fire"){
    setSimMessage("지도에서 발화 위치가 될 복도 센서를 클릭하세요.","warn");
  }
}

async function handleSensorSelection(id){
  if(state.selectionMode==="start"){
    state.startZone=id;
    localStorage.setItem("sim_start_zone",id);
    setSelectionMode("normal");
    setSimMessage(`내 위치를 ${id}로 선택했습니다.`);
  }else if(state.selectionMode==="fire"){
    state.fireZone=id;
    localStorage.setItem("sim_fire_zone",id);
    setSelectionMode("normal");
    setSimMessage(`발화 위치를 ${id}로 선택했습니다.`);
  }else{
    return;
  }

  resetSimulationState(false);
  renderSpecialMarkers();
  updateSummary();

  if(state.startZone&&state.fireZone){
    await startSimulation(true);
  }else{
    setGlobal("대기","내 위치와 발화 위치를 모두 선택하세요.");
  }
}

function resetSimulationState(clearLocations){
  stopSimulation();

  state.simElapsed=0;
  state.values={"0":{},"10":{},"20":{},"30":{}};
  state.routes={};

  if(clearLocations){
    state.startZone=null;
    state.fireZone=null;
    localStorage.removeItem("sim_start_zone");
    localStorage.removeItem("sim_fire_zone");
  }

  $("routeLayer").innerHTML="";
  Object.values(exitMarkers).forEach(marker=>marker.classList.remove("recommended"));
  updateSummary();
  renderSpecialMarkers();
  renderSimulation();
}

function renderSpecialMarkers(){
  if(startMarker)startMarker.remove();
  if(fireMarker)fireMarker.remove();

  if(state.startZone){
    const p=SIM_MAP.sensors[state.startZone];
    startMarker=document.createElement("div");
    startMarker.className="specialMarker startMarker";
    startMarker.style.left=p.x+"%";
    startMarker.style.top=p.y+"%";
    startMarker.innerHTML=`<div class="locationPin"></div><div class="markerLabel">내 위치 ${state.startZone}</div>`;
    $("specialLayer").appendChild(startMarker);
  }

  if(state.fireZone){
    const p=SIM_MAP.sensors[state.fireZone];
    fireMarker=document.createElement("div");
    fireMarker.className="specialMarker fireMarker";
    fireMarker.style.left=p.x+"%";
    fireMarker.style.top=p.y+"%";
    fireMarker.innerHTML=`<div class="fireIcon">🔥</div><div class="markerLabel">발화 ${state.fireZone}</div>`;
    $("specialLayer").appendChild(fireMarker);
  }
}

function updateSummary(){
  $("startSummary").textContent=state.startZone||"미선택";
  $("fireSummary").textContent=state.fireZone||"미선택";
  $("elapsedSeconds").textContent=Math.round(state.simElapsed)+"초";
  $("runSummary").textContent=state.simRunning?"실행 중":"정지";

  const shown=$("displayHorizon").value;
  const route=state.routes[shown];
  $("exitSummary").textContent=route?.exit||(
    state.startZone&&state.fireZone?"계산 중":"대기"
  );
}

function smokeValuesAt(elapsedSeconds){
  const result={};
  if(!state.fireZone){
    sensorIds.forEach(id=>result[id]=0);
    return result;
  }

  const distances=PathFinder.graphDistances(state.fireZone);

  sensorIds.forEach((id,index)=>{
    const distance=distances[id]??99;
    const arrival=distance*3.2;
    const age=elapsedSeconds-arrival;
    let value;

    if(id===state.fireZone){
      value=100;
    }else if(age<0){
      value=Math.max(0,5-distance*0.7);
    }else{
      value=8+92*(1-Math.exp(-(age+1)/8));
    }

    const wave=Math.sin((elapsedSeconds+index*1.7)/4)*1.2;
    result[id]=Math.max(0,Math.min(100,Math.round((value+wave)*10)/10));
  });

  return result;
}

async function buildDemoModels(){
  const models={};

  for(const horizon of [10,20,30]){
    const model=tf.sequential();
    const layer=tf.layers.dense({
      units:30,
      inputShape:[30],
      activation:"linear",
      useBias:true,
      trainable:false,
      name:"future_"+horizon
    });
    model.add(layer);

    const kernel=[];
    const bias=[];
    const radius=horizon===10?1:horizon===20?2:3;

    const distanceMaps={};
    sensorIds.forEach(id=>{
      distanceMaps[id]=PathFinder.graphDistances(id);
    });

    for(let inputIndex=0;inputIndex<30;inputIndex++){
      for(let outputIndex=0;outputIndex<30;outputIndex++){
        const inputId=sensorIds[inputIndex];
        const outputId=sensorIds[outputIndex];
        const distance=distanceMaps[outputId][inputId]??99;

        let weight=0;
        if(inputIndex===outputIndex){
          weight=0.70;
        }else if(distance<=radius){
          weight=(0.24/radius)*Math.exp(-distance/Math.max(1,radius));
        }
        kernel.push(weight);
      }
    }

    for(let i=0;i<30;i++){
      bias.push(horizon===10?0.01:horizon===20?0.025:0.04);
    }

    layer.setWeights([
      tf.tensor2d(kernel,[30,30],"float32"),
      tf.tensor1d(bias,"float32")
    ]);

    models[String(horizon)]=model;
  }

  return models;
}

async function initializeModels(){
  if(typeof tf==="undefined"){
    state.modelReady=false;
    state.modelSource="TensorFlow.js 로드 실패";
    state.verification="오류";
    updateAiDiagnostics();
    setGlobal("오류","TensorFlow.js CDN을 불러오지 못했습니다.");
    return;
  }

  $("tfVersion").textContent=tf.version.tfjs;

  try{
    const loaded={};
    for(const horizon of ["10","20","30"]){
      loaded[horizon]=await tf.loadLayersModel(
        DASHBOARD_CONFIG.modelPaths[horizon]
      );

      const inputSize=loaded[horizon].inputs[0].shape.at(-1);
      const outputSize=loaded[horizon].outputs[0].shape.at(-1);
      if(inputSize!==30||outputSize!==30){
        throw new Error(`${horizon}초 모델 입출력 크기 오류`);
      }
    }

    state.models=loaded;
    state.modelSource="5단계 학습 모델";
    state.modelReady=true;
  }catch(error){
    Object.values(state.models).forEach(model=>model?.dispose?.());
    state.models=await buildDemoModels();
    state.modelSource="내장 시연 모델";
    state.modelReady=true;
    console.warn("학습 모델 로드 실패, 내장 시연 모델 사용:",error);
  }

  updateAiDiagnostics();
  await verifyAi(false);
}

async function predictFutures(currentValues){
  if(!state.modelReady){
    return {
      "10":smokeValuesAt(state.simElapsed+10),
      "20":smokeValuesAt(state.simElapsed+20),
      "30":smokeValuesAt(state.simElapsed+30)
    };
  }

  const input=tf.tensor2d([
    sensorIds.map(id=>(currentValues[id]||0)/100)
  ],[1,30]);

  const predictions={};

  try{
    for(const horizon of ["10","20","30"]){
      const output=state.models[horizon].predict(input);
      const data=await output.data();
      const physicalMinimum=smokeValuesAt(
        state.simElapsed+Number(horizon)
      );

      predictions[horizon]={};
      sensorIds.forEach((id,index)=>{
        const modelValue=Math.max(0,Math.min(100,data[index]*100));
        predictions[horizon][id]=Math.round(
          Math.max(modelValue,physicalMinimum[id])*10
        )/10;
      });
      output.dispose();
    }

    state.inferenceCount++;
    state.lastInference=new Date();
    return predictions;
  }finally{
    input.dispose();
    updateAiDiagnostics();
  }
}

async function verifyAi(manual=true){
  if(!state.modelReady||typeof tf==="undefined"){
    state.verification="실패";
    updateAiDiagnostics();
    if(manual)setSimMessage("AI 검증 실패: 모델이 준비되지 않았습니다.","error");
    return false;
  }

  try{
    const testInput=tf.tensor2d([
      sensorIds.map((_,index)=>index/40)
    ],[1,30]);

    for(const horizon of ["10","20","30"]){
      const output=state.models[horizon].predict(testInput);
      const values=await output.data();

      if(values.length!==30||[...values].some(value=>!Number.isFinite(value))){
        throw new Error(`${horizon}초 모델 출력 오류`);
      }
      output.dispose();
    }

    testInput.dispose();
    state.verification="정상";
    updateAiDiagnostics();

    if(manual){
      setSimMessage(
        "AI 검증 성공: 3개 모델 모두 TensorFlow.js predict()를 실행하고 출력 30개를 확인했습니다.",
        "success"
      );
    }
    return true;
  }catch(error){
    state.verification="실패";
    updateAiDiagnostics();
    if(manual)setSimMessage("AI 검증 실패: "+error.message,"error");
    return false;
  }
}

function updateAiDiagnostics(){
  $("modelSource").textContent=state.modelSource;
  $("tfVersion").textContent=typeof tf==="undefined"?"로드 실패":tf.version.tfjs;
  $("verificationStatus").textContent=state.verification;
  $("inferenceCount").textContent=state.inferenceCount+"회";
  $("lastInference").textContent=state.lastInference?
    state.lastInference.toLocaleTimeString("ko-KR"):"없음";

  const current=state.values["0"]||{};
  const future=state.values["30"]||{};
  const deltas=sensorIds.map(id=>
    Math.abs((future[id]||0)-(current[id]||0))
  );
  const maxDelta=deltas.length?Math.max(...deltas):0;
  $("predictionDelta").textContent=maxDelta.toFixed(1);

  $("aiExplanation").textContent=
    state.modelSource==="5단계 학습 모델"
      ?"5단계에서 생성한 학습 모델을 사용 중입니다. 검증은 페이지 시작 시 자동 실행되며 버튼으로 다시 실행할 수 있습니다."
      :"학습 모델 파일을 찾지 못해 TensorFlow.js 내장 시연 모델을 사용 중입니다. predict() 자체는 실제로 실행됩니다.";
}

async function simulationTick(){
  if(
    state.simBusy||
    !state.simRunning||
    !state.startZone||
    !state.fireZone
  )return;

  state.simBusy=true;

  try{
    state.values["0"]=smokeValuesAt(state.simElapsed);
    const futures=await predictFutures(state.values["0"]);
    state.values["10"]=futures["10"];
    state.values["20"]=futures["20"];
    state.values["30"]=futures["30"];

    calculateRoutes();
    renderSimulation();

    state.simElapsed+=state.simIntervalMs/1000;
    updateSummary();
  }catch(error){
    stopSimulation();
    setSimMessage("시뮬레이션 오류: "+error.message,"error");
    setGlobal("오류","시뮬레이션이 중지되었습니다.");
    console.error(error);
  }finally{
    state.simBusy=false;
  }
}

async function startSimulation(resetElapsed){
  if(!state.startZone||!state.fireZone){
    setSimMessage("내 위치와 발화 위치를 모두 선택해야 합니다.","warn");
    return;
  }

  stopSimulation();

  if(resetElapsed)state.simElapsed=0;
  state.simRunning=true;
  updateSummary();
  setGlobal("LIVE","1초마다 연기값과 대피 경로를 다시 계산합니다.");
  setSimMessage("실시간 시뮬레이션 실행 중입니다.","success");

  await simulationTick();
  state.simTimer=setInterval(simulationTick,state.simIntervalMs);
}

function stopSimulation(){
  clearInterval(state.simTimer);
  state.simTimer=null;
  state.simRunning=false;
  updateSummary();
}

async function changeSimulationInterval(){
  state.simIntervalMs=Number($("simInterval").value);
  localStorage.setItem("sim_interval",String(state.simIntervalMs));

  if(state.simRunning){
    await startSimulation(false);
  }
}

function calculateRoutes(){
  if(!state.startZone||!state.fireZone){
    state.routes={};
    return;
  }

  horizons.forEach(horizon=>{
    state.routes[horizon]=PathFinder.findSafestExit(
      state.startZone,
      state.values[horizon]||{}
    );
  });
}

function drawRoute(route){
  $("routeLayer").innerHTML="";
  Object.values(exitMarkers).forEach(marker=>
    marker.classList.remove("recommended")
  );

  if(!route?.path?.length)return;

  const points=PathFinder.expandPath(route.path)
    .map(point=>`${point.x},${point.y}`)
    .join(" ");

  const line=document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline"
  );
  line.setAttribute("points",points);
  line.setAttribute("class","routeLine");
  $("routeLayer").appendChild(line);

  exitMarkers[route.exit]?.classList.add("recommended");
}

function renderSimulation(){
  const horizon=$("displayHorizon").value;
  const values=state.values[horizon]||{};
  const route=state.routes[horizon];

  sensorIds.forEach(id=>{
    const value=Number(values[id]||0);
    sensorMarkers[id].style.background=riskColor(value);
    sensorCards[id].style.borderTopColor=riskColor(value);
    sensorCards[id].querySelector("span").textContent=value.toFixed(1);
  });

  const label=horizon==="0"?"현재":horizon+"초 뒤";
  $("mapTimeLabel").textContent=label;
  $("sensorGridLabel").textContent=label+" 위험도";

  if(state.startZone&&state.fireZone){
    drawRoute(route);
  }else{
    drawRoute(null);
  }

  horizons.forEach(h=>{
    const item=state.routes[h];
    $(`routeExit${h}`).textContent=item?.exit||"대기";
    $(`routePath${h}`).textContent=item?.path?.join(" → ")||"위치 선택 전";
  });

  renderSpecialMarkers();
  updateSummary();
  updateAiDiagnostics();
}

function downloadSimulationCsv(){
  const headers=["sensor_id","current","t10","t20","t30"];
  const rows=sensorIds.map(id=>[
    id,
    state.values["0"][id]??"",
    state.values["10"][id]??"",
    state.values["20"][id]??"",
    state.values["30"][id]??""
  ]);

  const csv="\uFEFF"+headers.join(",")+"\n"+
    rows.map(row=>row.join(",")).join("\n");

  const url=URL.createObjectURL(
    new Blob([csv],{type:"text/csv;charset=utf-8"})
  );
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download="fire_simulation_snapshot.csv";
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}


function actualNumber(payload,id,index){
  const legacy="R"+(index+1);
  const values=[
    payload?.actual_sensors?.[id],
    payload?.sensors?.[id],
    payload?.sensors?.[legacy],
    payload?.raw?.[id]
  ];

  for(const value of values){
    const number=Number(value);
    if(Number.isFinite(number))return Math.max(0,Math.min(100,number));
  }
  return 0;
}

function flameDetected(payload){
  const values=[
    payload?.flame?.F1,
    payload?.sensors?.F1,
    payload?.flame_detected,
    payload?.fire_detected
  ];

  for(const value of values){
    if(value===true)return true;
    if(value===false)return false;

    if(Number.isFinite(Number(value))){
      return Number(value)>0;
    }

    const text=String(value??"").toLowerCase();
    if(["true","on","detected","감지"].includes(text))return true;
    if(["false","off","none","미감지"].includes(text))return false;
  }
  return false;
}

function actualRouteKey(a,b){
  return [a,b].sort().join("|");
}

function actualRoutePoints(a,b){
  const key=actualRouteKey(a,b);
  const configured=ACTUAL_MAP.routes[key];
  const start=ACTUAL_MAP.points[a]||ACTUAL_MAP.exits[a];

  if(!configured){
    return [
      ACTUAL_MAP.points[a]||ACTUAL_MAP.exits[a],
      ACTUAL_MAP.points[b]||ACTUAL_MAP.exits[b]
    ];
  }

  const first=configured[0];
  const forward=Math.hypot(first.x-start.x,first.y-start.y)<0.01;
  return forward?configured:[...configured].reverse();
}

function actualDistance(a,b){
  const points=actualRoutePoints(a,b);
  let total=0;

  for(let i=1;i<points.length;i++){
    total+=Math.hypot(
      points[i].x-points[i-1].x,
      points[i].y-points[i-1].y
    );
  }
  return total/10;
}

function buildActualGraph(){
  const graph={};

  function add(a,b){
    graph[a]??=[];
    graph[a].push({node:b,distance:actualDistance(a,b)});
  }

  ACTUAL_MAP.edges.forEach(([a,b])=>{
    add(a,b);
    add(b,a);
  });

  return graph;
}

const ACTUAL_GRAPH=buildActualGraph();

function actualHeuristic(node,goal){
  const a=ACTUAL_MAP.points[node]||ACTUAL_MAP.exits[node];
  const b=ACTUAL_MAP.points[goal]||ACTUAL_MAP.exits[goal];
  return Math.hypot(a.x-b.x,a.y-b.y)/10;
}

function actualAStar(start,goal,risks){
  const open=new Set([start]);
  const came={};
  const g={[start]:0};
  const f={[start]:actualHeuristic(start,goal)};

  while(open.size){
    let current=[...open].reduce((best,node)=>
      (f[node]??Infinity)<(f[best]??Infinity)?node:best
    );

    if(current===goal){
      const path=[current];
      while(came[current]){
        current=came[current];
        path.unshift(current);
      }
      return{path,cost:g[goal]};
    }

    open.delete(current);

    for(const edge of ACTUAL_GRAPH[current]||[]){
      const next=edge.node;
      const risk=next.startsWith("A")?Number(risks[next]||0):0;

      if(risk>=97&&next!==start)continue;

      const riskCost=Math.pow(risk/24,2);
      const tentative=(g[current]??Infinity)+edge.distance+riskCost;

      if(tentative<(g[next]??Infinity)){
        came[next]=current;
        g[next]=tentative;
        f[next]=tentative+actualHeuristic(next,goal);
        open.add(next);
      }
    }
  }

  return null;
}

function findActualSafestExit(start,risks){
  const results=Object.keys(ACTUAL_MAP.exits)
    .map(exit=>({exit,result:actualAStar(start,exit,risks)}))
    .filter(item=>item.result);

  if(!results.length)return null;

  results.sort((a,b)=>a.result.cost-b.result.cost);
  return{exit:results[0].exit,...results[0].result};
}

function expandActualPath(path){
  if(!path||path.length<2)return[];

  const result=[];

  for(let i=1;i<path.length;i++){
    const segment=actualRoutePoints(path[i-1],path[i]);
    if(i>1)segment.shift();
    result.push(...segment);
  }

  return result;
}

async function buildActualModels(){
  const models={};
  const neighborMap={
    A1:["A2"],
    A2:["A1","A3","A4"],
    A3:["A2"],
    A4:["A2"]
  };
  const ids=["A1","A2","A3","A4"];

  for(const horizon of [10,20,30]){
    const model=tf.sequential();
    const layer=tf.layers.dense({
      units:4,
      inputShape:[4],
      activation:"linear",
      useBias:true,
      trainable:false,
      name:"actual_future_"+horizon
    });
    model.add(layer);

    const selfWeight=horizon===10?0.90:horizon===20?0.82:0.74;
    const neighborTotal=horizon===10?0.12:horizon===20?0.20:0.28;
    const biasValue=horizon===10?0.01:horizon===20?0.025:0.04;

    const matrix=[];

    ids.forEach(inputId=>{
      ids.forEach(outputId=>{
        let weight=0;

        if(inputId===outputId){
          weight=selfWeight;
        }else if(neighborMap[outputId].includes(inputId)){
          weight=neighborTotal/neighborMap[outputId].length;
        }

        matrix.push(weight);
      });
    });

    layer.setWeights([
      tf.tensor2d(matrix,[4,4],"float32"),
      tf.tensor1d([biasValue,biasValue,biasValue,biasValue],"float32")
    ]);

    models[String(horizon)]=model;
  }

  return models;
}

async function initializeActualModels(){
  if(typeof tf==="undefined"){
    state.actualModelReady=false;
    $("actualModelStatus").textContent="TensorFlow 로드 실패";
    return;
  }

  state.actualModels=await buildActualModels();
  state.actualModelReady=true;
  $("actualModelStatus").textContent="4센서 추정 모델";
}


function resetActualIgnitionTracking(currentValues={}){
  state.actualFlameWasOn=false;
  state.actualIgnitionSensor=null;
  state.actualFlameBaseline={...currentValues};
  state.actualDetectionStartedAt=null;
  state.actualIgnitionDetectedAt=null;
}

function trackFirstAlcoholDetection(currentValues,flame){
  const ids=["A1","A2","A3","A4"];
  const previous={...state.actualPreviousRaw};
  const hasPrevious=ids.some(id=>Number.isFinite(Number(previous[id])));

  if(!flame){
    resetActualIgnitionTracking(currentValues);
    state.actualPreviousRaw={...currentValues};
    return null;
  }

  if(!state.actualFlameWasOn){
    state.actualFlameWasOn=true;
    state.actualIgnitionSensor=null;
    state.actualDetectionStartedAt=Date.now();
    state.actualIgnitionDetectedAt=null;
    state.actualFlameBaseline=hasPrevious
      ?Object.fromEntries(ids.map(id=>[id,Number(previous[id]||0)]))
      :{...currentValues};
  }

  if(!state.actualIgnitionSensor){
    const candidates=ids.map((id,index)=>{
      const value=Number(currentValues[id]||0);
      const baseline=Number(state.actualFlameBaseline[id]||0);
      const prev=Number(previous[id]??baseline);
      const rise=value-baseline;
      const step=value-prev;

      return{id,index,value,baseline,rise,step};
    }).filter(item=>
      (
        item.value>=state.actualAlcoholThreshold &&
        (
          item.rise>=state.actualRiseThreshold ||
          item.step>=3
        )
      ) ||
      item.value>=25 // 수정: 즉시 발화 인지 기준을 25(매우 위험)로 변경
    );

    if(candidates.length){
      candidates.sort((a,b)=>
        b.step-a.step ||
        b.rise-a.rise ||
        b.value-a.value ||
        a.index-b.index
      );

      state.actualIgnitionSensor=candidates[0].id;
      state.actualIgnitionDetectedAt=Date.now();
    }
  }

  state.actualPreviousRaw={...currentValues};
  return state.actualIgnitionSensor;
}

function applyActualFlame(values,flame,horizon){
  const result={...values};
  const origin=state.actualIgnitionSensor;

  if(!flame||!origin)return result;

  result[origin]=100;

  const neighborMap={
    A1:["A2"],
    A2:["A1","A3","A4"],
    A3:["A2"],
    A4:["A2"]
  };

  const minimum=horizon===0?45:horizon===10?58:horizon===20?72:85;

  neighborMap[origin].forEach(id=>{
    result[id]=Math.max(Number(result[id]||0),minimum);
  });

  return result;
}

async function predictActualFutures(currentValues,flame){
  const ids=["A1","A2","A3","A4"];

  if(!state.actualModelReady){
    return{
      "10":applyActualFlame({...currentValues},flame,10),
      "20":applyActualFlame({...currentValues},flame,20),
      "30":applyActualFlame({...currentValues},flame,30)
    };
  }

  const input=tf.tensor2d([
    ids.map(id=>Number(currentValues[id]||0)/100)
  ],[1,4]);

  const result={};

  try{
    for(const horizon of ["10","20","30"]){
      const output=state.actualModels[horizon].predict(input);
      const data=await output.data();

      result[horizon]={};
      ids.forEach((id,index)=>{
        result[horizon][id]=Math.max(
          0,
          Math.min(100,Math.round(data[index]*1000)/10)
        );
      });

      result[horizon]=applyActualFlame(
        result[horizon],
        flame,
        Number(horizon)
      );

      output.dispose();
    }

    state.actualInferenceCount++;
    state.actualLastInference=new Date();

    return result;
  }finally{
    input.dispose();
  }
}

function calculateActualRoutes(){
  if(!state.actualStart){
    state.actualRoutes={};
    return;
  }

  ["0","10","20","30"].forEach(horizon=>{
    state.actualRoutes[horizon]=findActualSafestExit(
      state.actualStart,
      state.actualValues[horizon]||{}
    );
  });
}

function drawActualRoute(route){
  $("actualRouteLayer").innerHTML="";

  Object.values(actualExitMarkers).forEach(marker=>
    marker.classList.remove("recommended")
  );

  if(!route?.path?.length)return;

  const points=expandActualPath(route.path)
    .map(point=>`${point.x},${point.y}`)
    .join(" ");

  const line=document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline"
  );
  line.setAttribute("points",points);
  line.setAttribute("class","actualRouteLine");
  $("actualRouteLayer").appendChild(line);

  actualExitMarkers[route.exit]?.classList.add("recommended");
}

function renderActualSpecialMarkers(flame){
  if(actualStartMarker)actualStartMarker.remove();
  if(actualFireMarker)actualFireMarker.remove();

  if(state.actualStart){
    const p=ACTUAL_MAP.points[state.actualStart];
    actualStartMarker=document.createElement("div");
    actualStartMarker.className="actualStartMarker";
    actualStartMarker.style.left=p.x+"%";
    actualStartMarker.style.top=p.y+"%";
    actualStartMarker.innerHTML=
      `<div class="actualStartPin"></div><div class="markerLabel">내 위치 ${state.actualStart}</div>`;
    $("actualSpecialLayer").appendChild(actualStartMarker);
  }

  if(flame&&state.actualIgnitionSensor){
    const origin=state.actualIgnitionSensor;
    const p=ACTUAL_MAP.points[origin];

    actualFireMarker=document.createElement("div");
    actualFireMarker.className="actualFireEstimate";
    actualFireMarker.style.left=p.x+"%";
    actualFireMarker.style.top=p.y+"%";
    actualFireMarker.innerHTML=
      `<div class="fireIcon">🔥</div><div class="markerLabel">최초 감지 ${origin} · 위치 고정</div>`;

    $("actualSpecialLayer").appendChild(actualFireMarker);
  }
}

function selectActualStart(id){
  state.actualStart=id;
  state.actualSelectionMode=false;
  localStorage.setItem("actual_start",id);

  Object.values(actualPointMarkers).forEach(marker=>
    marker.classList.remove("selectable")
  );

  $("actualStartSummary").textContent=id;
  setActualMessage(`내 위치를 맵 ${id.slice(1)}번(${id})으로 설정했습니다. 경로를 다시 계산합니다.`,"success");

  calculateActualRoutes();
  renderActual(state.actualPayload||{});
}

function enableActualStartSelection(){
  state.actualSelectionMode=!state.actualSelectionMode;

  Object.values(actualPointMarkers).forEach(marker=>
    marker.classList.toggle("selectable",state.actualSelectionMode)
  );

  if(state.actualSelectionMode){
    setActualMessage("맵의 1~4 중 현재 위치를 클릭하세요.","warn");
  }else{
    setActualMessage("내 위치 선택을 취소했습니다.");
  }
}

function clearActualStart(){
  state.actualStart=null;
  state.actualSelectionMode=false;
  state.actualRoutes={};
  localStorage.removeItem("actual_start");

  Object.values(actualPointMarkers).forEach(marker=>
    marker.classList.remove("selectable")
  );

  $("actualStartSummary").textContent="미선택";
  $("actualExitSummary").textContent="대기";
  drawActualRoute(null);
  renderActual(state.actualPayload||{});
  setActualMessage("내 위치를 해제했습니다.");
}

async function processActualPayload(payload){
  const ids=["A1","A2","A3","A4"];
  const current={};

  ids.forEach((id,index)=>{
    current[id]=actualNumber(payload,id,index);
  });

  const flame=flameDetected(payload);

  trackFirstAlcoholDetection(current,flame);
  state.actualValues["0"]=applyActualFlame(current,flame,0);

  const futures=await predictActualFutures(
    state.actualValues["0"],
    flame
  );

  state.actualValues["10"]=futures["10"];
  state.actualValues["20"]=futures["20"];
  state.actualValues["30"]=futures["30"];

  calculateActualRoutes();
  renderActual(payload);
}

function renderActual(payload){
  const ids=["A1","A2","A3","A4"];
  const horizon=$("actualHorizon").value;
  const values=state.actualValues[horizon]||{};
  const route=state.actualRoutes[horizon];
  const flame=flameDetected(payload);

  ids.forEach((id,index)=>{
    const value=Number(values[id]??actualNumber(payload,id,index));
    const card=$("actual-"+id);

    card.style.borderTopColor=actualRiskColor(value); // 수정: 실제 구현용 색상 함수 적용
    card.querySelector("strong").textContent=value.toFixed(1);

    const marker=actualPointMarkers[id];
    marker.style.background=actualRiskColor(value); // 수정: 실제 구현용 색상 함수 적용
    marker.title=`맵 ${index+1} · ${id} · 위험도 ${value.toFixed(1)}`;
  });

  const horizonLabel=horizon==="0"?"현재":horizon+"초 뒤";
  $("actualSensorTimeLabel").textContent=horizonLabel+" 위험도";
  $("actualMapTimeLabel").textContent=horizonLabel;

  const ignition=state.actualIgnitionSensor;
  const flameText=!flame
    ?"미감지"
    :ignition
      ?`감지 · ${ignition} 고정`
      :"감지 · 최초 알코올 대기";

  $("flameStatus").textContent=flameText;
  $("flameCardText").textContent=flameText;
  $("actualIgnitionSummary").textContent=ignition
    ?`${ignition} (맵 ${ignition.slice(1)})`
    :flame
      ?"추적 중"
      :"대기";

  $("flameTrackingText").textContent=!flame
    ?"F1 미감지: 발화 추적 대기"
    :ignition
      ?`${ignition}이 가장 먼저 반응하여 불꽃 위치를 고정했습니다.`
      :`A1~A4 중 최초 반응을 추적 중입니다. 기준 ${state.actualAlcoholThreshold}, 상승 ${state.actualRiseThreshold} 이상`;

  $("flameCard").classList.toggle("on",flame);
  $("flameCard").classList.toggle("off",!flame);

  $("actualDevice").textContent=payload?.device_id||"-";
  $("actualStatus").textContent=payload?.status||"NO DATA";
  $("actualAge").textContent=payload?.age_seconds==null
    ?"-"
    :Number(payload.age_seconds).toFixed(1)+"초";

  $("actualStartSummary").textContent=state.actualStart||"미선택";
  $("actualExitSummary").textContent=route?.exit||(
    state.actualStart?"계산 중":"대기"
  );

  if(state.actualStart){
    drawActualRoute(route);
  }else{
    drawActualRoute(null);
  }

  ["0","10","20","30"].forEach(h=>{
    const item=state.actualRoutes[h];
    $(`actualRouteExit${h}`).textContent=item?.exit||"대기";
    $(`actualRoutePath${h}`).textContent=item?.path?.join(" → ")||"내 위치 선택 전";
  });

  $("actualModelStatus").textContent=state.actualModelReady
    ?"4센서 TensorFlow 모델"
    :"모델 준비 전";

  $("actualInferenceCount").textContent=
    state.actualInferenceCount+"회";

  $("actualLastInference").textContent=
    state.actualLastInference
      ?state.actualLastInference.toLocaleTimeString("ko-KR")
      :"없음";

  const current=state.actualValues["0"]||{};
  const future=state.actualValues["30"]||{};
  const maxDelta=Math.max(...ids.map(id=>
    Math.abs(Number(future[id]||0)-Number(current[id]||0))
  ));

  $("actualPredictionDelta").textContent=
    Number.isFinite(maxDelta)?maxDelta.toFixed(1):"-";

  renderActualSpecialMarkers(flame);
}

async function fetchActualData(){
  const url=$("apiUrl").value.trim().replace(/\/+$/,"");

  if(!url){
    setActualMessage("Apps Script /exec 주소를 입력하세요.","warn");
    return;
  }

  try{
    const separator=url.includes("?")?"&":"?";

    const response=await fetch(
      url+separator+"action=latest",
      {cache:"no-store"}
    );

    if(!response.ok){
      throw new Error("HTTP "+response.status);
    }

    const payload=await response.json();

    if(!payload.ok){
      throw new Error(payload.error||"latest 응답 오류");
    }

    state.actualPayload=payload;
    await processActualPayload(payload);

    setActualMessage(
      state.actualIgnitionSensor
        ?`A1~A4 실제값을 반영했습니다. 최초 알코올 감지 위치는 ${state.actualIgnitionSensor}으로 고정되었습니다.`
        :flameDetected(payload)
          ?"F1이 감지되었습니다. A1~A4 중 가장 먼저 반응하는 센서를 추적 중입니다."
          :"A1~A4 실제값을 받아 TensorFlow 예측과 대피 경로를 갱신했습니다.",
      "success"
    );

    setGlobal(
      payload.status||"LIVE",
      "ESP32 실제 센서 기반 대피 경로 갱신 완료"
    );

  }catch(error){
    setActualMessage(
      "센서값 수신 실패: "+error.message,
      "error"
    );

    setGlobal(
      "오류",
      "Apps Script 연결을 확인하세요."
    );
  }
}

function restartActualTimer(){
  clearInterval(state.actualTimer);

  const interval=Number(
    $("actualInterval").value
  );

  if(interval>0){
    state.actualTimer=setInterval(
      fetchActualData,
      interval
    );
  }
}

function saveActualSettings(){
  localStorage.setItem("actual_api_url",$("apiUrl").value.trim());
  localStorage.setItem("actual_interval",$("actualInterval").value);
  restartActualTimer();
  setActualMessage("실제 구현 설정을 저장했습니다.","success");
}

function bindEvents(){
  $("tabSimulation").onclick=()=>switchTab("simulation");
  $("tabActual").onclick=()=>switchTab("actual");

  $("chooseStart").onclick=()=>setSelectionMode(
    state.selectionMode==="start"?"normal":"start"
  );
  $("chooseFire").onclick=()=>setSelectionMode(
    state.selectionMode==="fire"?"normal":"fire"
  );

  $("clearSelection").onclick=()=>{
    resetSimulationState(true);
    setSelectionMode("normal");
    setSimMessage("내 위치와 발화 위치를 다시 선택하세요.");
    setGlobal("대기","위치 선택 대기");
  };

  $("pauseSimulation").onclick=()=>{
    stopSimulation();
    setSimMessage("시뮬레이션을 일시정지했습니다.","warn");
    setGlobal("대기","시뮬레이션 일시정지");
  };

  $("resumeSimulation").onclick=()=>startSimulation(false);
  $("simInterval").onchange=changeSimulationInterval;
  $("displayHorizon").onchange=renderSimulation;
  $("verifyAi").onclick=()=>verifyAi(true);
  $("downloadCsv").onclick=downloadSimulationCsv;

  $("chooseActualStart").onclick=enableActualStartSelection;
  $("clearActualStart").onclick=clearActualStart;
  $("actualHorizon").onchange=()=>renderActual(state.actualPayload||{});
  $("saveApi").onclick=saveActualSettings;
  $("fetchActual").onclick=fetchActualData;
  $("actualInterval").onchange=restartActualTimer;
}

async function init(){
  buildSimulationUi();
  bindEvents();

  state.startZone=localStorage.getItem("sim_start_zone")||null;
  state.fireZone=localStorage.getItem("sim_fire_zone")||null;
  state.simIntervalMs=Number(
    localStorage.getItem("sim_interval")||1000
  );
  $("simInterval").value=String(state.simIntervalMs);

  $("apiUrl").value=localStorage.getItem("actual_api_url")||"";
  $("actualInterval").value=localStorage.getItem("actual_interval")||"1000";
  state.actualStart=localStorage.getItem("actual_start")||null;

  switchTab("simulation");
  renderSpecialMarkers();
  renderSimulation();
  renderActual({});
  if(state.actualStart){
    $("actualStartSummary").textContent=state.actualStart;
  }
  restartActualTimer();

  await initializeModels();
  await initializeActualModels();

  if(state.startZone&&state.fireZone){
    await startSimulation(true);
  }
}

init();
})();
