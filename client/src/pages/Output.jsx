import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { FileCode, FileJson, X, Terminal, Maximize2, Minimize2, Download, ChevronRight, RefreshCw, Network } from 'lucide-react';
import ReactFlow, { Background, MarkerType } from 'reactflow'; // 🚀 Removed Controls import
import 'reactflow/dist/style.css';

const Output = () => {
  const { id } = useParams();
  const location = useLocation();
  const { useMongo, mongoUri, mockRows } = location.state || {};

  const [files, setFiles] = useState([]);
  const [inputFiles, setInputFiles] = useState([]);
  const [logs, setLogs] = useState([]);

  // React Flow State
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [executionOrder, setExecutionOrder] = useState([]); // 🚀 NEW: State for the sorted path

  const [activeFileId, setActiveFileId] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);

  const [isProcessing, setIsProcessing] = useState(true);
  const [hasError, setHasError] = useState(false);

  const hasStarted = useRef(false);
  const terminalRef = useRef(null);

  // Helper to convert RuleBook JSON into React Flow Nodes/Edges
  const buildGraphData = (rulebook) => {
    const newNodes = [];
    const newEdges = [];
    let x = 50;
    let y = 50;

    const normalizeId = (name) => {
      if (!name) return '';
      let clean = name.toLowerCase()
        .replace(/[^a-z0-9]/g, '') 
        .replace('model', '')
        .replace('json', '')
        .replace('js', '');
      if (clean.endsWith('s')) clean = clean.slice(0, -1);
      return clean.trim();
    };

    // --- 1. BUILD VISUAL NODES & EDGES ---
    rulebook.forEach((col, i) => {
      const sourceId = normalizeId(col.collectionName);

      newNodes.push({
        id: sourceId,
        data: { label: col.collectionName.replace('.model', '').toUpperCase() },
        position: { x: x + (i % 3) * 250, y: y + Math.floor(i / 3) * 150 },
        style: {
          background: '#1e1e1e', color: '#e5e7eb', border: '2px solid #3c3c3c',
          borderRadius: '8px', padding: '12px 20px', fontSize: '12px',
          fontWeight: 'bold', letterSpacing: '1px', minWidth: '150px',
          textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
        }
      });

      col.fields.forEach(f => {
        if (f.ref || (f.isReference && f.ref)) {
          const targetId = normalizeId(f.ref);
          newEdges.push({
            id: `e-${sourceId}-${targetId}`,
            source: sourceId,
            target: targetId,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#4ade80' },
            style: { stroke: '#4ade80', strokeWidth: 2 }
          });
        } else if (f.refPath && f.enum) {
          f.enum.forEach(refTgt => {
            const targetId = normalizeId(refTgt);
            newEdges.push({
              id: `e-${sourceId}-${targetId}`,
              source: sourceId,
              target: targetId,
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7' },
              style: { stroke: '#a855f7', strokeWidth: 2, strokeDasharray: '5,5' }
            });
          });
        }
      });
    });

    // --- 2. THE FIX: KAHN'S ALGORITHM (TOPOLOGICAL SORT) ---
    const adjList = {};
    const inDegree = {};
    const originalNames = {};

    // Initialize trackers
    rulebook.forEach(col => {
      const id = normalizeId(col.collectionName);
      adjList[id] = [];
      inDegree[id] = 0;
      originalNames[id] = col.collectionName.replace('.model', '').toUpperCase();
    });

    // Map the dependencies (Requirement -> Dependent)
    rulebook.forEach(col => {
      const dependentId = normalizeId(col.collectionName);
      col.fields.forEach(f => {
        let targets = [];
        if (f.ref || (f.isReference && f.ref)) targets.push(normalizeId(f.ref));
        else if (f.refPath && f.enum) f.enum.forEach(tgt => targets.push(normalizeId(tgt)));

        targets.forEach(reqId => {
          if (adjList[reqId] !== undefined && reqId !== dependentId) {
            adjList[reqId].push(dependentId);
            inDegree[dependentId]++;
          }
        });
      });
    });

    // Sort the execution order
    const queue = Object.keys(inDegree).filter(node => inDegree[node] === 0);
    const sortedSequence = [];

    while (queue.length > 0) {
      queue.sort(); // Match backend alphabetical tie-breaking
      const current = queue.shift();
      sortedSequence.push(originalNames[current]);

      adjList[current].forEach(neighbor => {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      });
    }

    // Catch any circular loops that broke the math
    Object.keys(originalNames).forEach(node => {
      if (!sortedSequence.includes(originalNames[node])) {
        sortedSequence.push(originalNames[node] + " 🔄");
      }
    });

    // Commit to state
    setExecutionOrder(sortedSequence);
    setNodes(newNodes);
    setEdges(newEdges);
  };

  useEffect(() => {
    const sse = new EventSource(`${import.meta.env.VITE_API_BASE_URL}/api/stream`);

    sse.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLogs((prev) => [...prev, data.text]);
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
    };

    sse.onerror = () => {
      setLogs((prev) => [...prev, "⚠️ Lost connection to MockMate Engine."]);
    };

    return () => sse.close();
  }, []);

  const executePipeline = async () => {
    setIsProcessing(true);
    setHasError(false);
    setLogs((prev) => [...prev, "🔄 Initializing generation pipeline..."]);

    try {
      const inputRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/files?type=input`);
      const inputData = await inputRes.json();
      setInputFiles(inputData.files.map((f, i) => ({
        id: `in${i}`, name: f.filename, type: 'js', content: f.content
      })));

      const buildRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/build-mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: Number(mockRows) || 10 })
      });

      if (!buildRes.ok) throw new Error("Pipeline Failed. The AI might have timed out.");

      const outRes = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/files?type=output`);
      const outData = await outRes.json();
      const formattedOutputs = outData.files.map((f, i) => ({
        id: `out${i}`, name: f.filename, type: 'json', content: f.content
      }));
      setFiles(formattedOutputs);

      const rulebook = formattedOutputs.find(f => f.name === 'RuleBook.json');
      if (rulebook) {
        const parsedRulebook = JSON.parse(rulebook.content);
        
        // Let our new function handle the nodes, edges, AND the sorting sequence!
        buildGraphData(parsedRulebook);
        
        setActiveFileId('graph'); 
      }

      if (useMongo && mongoUri) {
        await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/seed-db`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mongoUri })
        });
      }

    } catch (error) {
      setHasError(true);
      setLogs((prev) => [...prev, `❌ Critical Error: ${error.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      setTimeout(() => executePipeline(), 1000);
    }
  }, [useMongo, mongoUri]);

  const activeFile = files.find(f => f.id === activeFileId) || inputFiles.find(f => f.id === activeFileId);

  const openFile = (fileId) => {
    if (!openTabs.includes(fileId)) setOpenTabs([...openTabs, fileId]);
    setActiveFileId(fileId);
  };

  const closeTab = (e, fileId) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(id => id !== fileId);
    setOpenTabs(newTabs);
    if (activeFileId === fileId) {
      setActiveFileId(newTabs.length > 0 ? newTabs[newTabs.length - 1] : (nodes.length > 0 ? 'graph' : null));
    }
  };

  const handleDownloadZip = () => window.open(`${import.meta.env.VITE_API_BASE_URL}/api/download`, '_blank');
  const toggleTerminal = () => { setIsTerminalExpanded(!isTerminalExpanded); if (!isTerminalExpanded) setIsEditorExpanded(false); };
  const toggleEditor = () => { setIsEditorExpanded(!isEditorExpanded); if (!isEditorExpanded) setIsTerminalExpanded(false); };

  return (
    <main className="max-w-8xl mx-auto px-4 md:px-6 pt-24 pb-8 min-h-[calc(100vh-100px)] relative z-10 transition-colors duration-300">
      <div className="flex flex-col lg:flex-row gap-6 h-[85vh]">
        
        {/* Left Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-4 relative z-20 h-full">
          
          <div className="flex-1 min-h-[150px] flex flex-col bg-[#1a1f2e] border border-gray-800 rounded-xl overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-gray-800 bg-[#1e2333] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-semibold text-gray-300">Input_Schemas</h2>
                {hasError && (
                  <button onClick={executePipeline} className="flex items-center gap-1 bg-red-500/20 text-red-400 hover:bg-red-500/40 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer">
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {inputFiles.length === 0 ? (
                <p className="text-sm text-gray-500 p-4 text-center">Loading schemas...</p>
              ) : (
                inputFiles.map(file => (
                  <div key={file.id} onClick={() => openFile(file.id)} className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm mb-1 transition-colors group ${activeFileId === file.id ? 'bg-[#2a3045] text-blue-400' : 'hover:bg-[#22283a] text-gray-400'}`}>
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCode className="w-4 h-4 flex-shrink-0 opacity-70" />
                      <span className="truncate">{file.name}</span>
                    </div>
                    <button onClick={(e) => closeInputFile(e, file.id)} className={`p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors ${activeFileId === file.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <X className="w-3 h-3 cursor-pointer" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 min-h-[150px] flex flex-col bg-[#1a1f2e] border border-gray-800 rounded-xl overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-gray-800 bg-[#1e2333] flex justify-between items-center">
              <h2 className="text-xs font-semibold text-gray-300">Generated_Data</h2>
              <button className="text-gray-400 hover:text-white transition-colors" title="Download Data" onClick={handleDownloadZip}>
                <Download className="w-4 h-4 cursor-pointer" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {files.length === 0 ? (
                <p className={`text-sm p-4 text-center ${hasError ? 'text-red-400/70' : 'text-gray-500'}`}>
                  {hasError ? "Failed to generate." : isProcessing ? "Generating..." : "No files generated."}
                </p>
              ) : (
                files.map(file => (
                  <div key={file.id} onClick={() => openFile(file.id)} className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm mb-1 transition-colors group ${activeFileId === file.id ? 'bg-[#2a3045] text-blue-400' : 'hover:bg-[#22283a] text-gray-400'}`}>
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileJson className="w-4 h-4 flex-shrink-0 opacity-70 text-yellow-400" />
                      <span className="truncate">{file.name}</span>
                    </div>
                    <button onClick={(e) => closeFile(e, file.id)} className={`p-1 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors ${activeFileId === file.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      <X className="w-3 h-3 cursor-pointer" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side - File Viewer & Terminal */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden relative">
          
          <div className={`bg-[#1e1e1e] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-lg flex-col transition-all duration-300 ${isEditorExpanded ? 'absolute inset-0 z-30 h-full' : 'flex-1 min-h-[300px]'} ${isTerminalExpanded ? 'hidden' : 'flex'}`}>
            <div className="flex items-center justify-between bg-[#252526] border-b border-[#3c3c3c]">
              <div className="flex items-center overflow-x-auto flex-nowrap flex-1">
                
                {nodes.length > 0 && (
                  <div onClick={() => setActiveFileId('graph')} className={`flex items-center gap-2 px-4 py-2 min-w-[150px] cursor-pointer border-r border-[#3c3c3c] transition-colors ${activeFileId === 'graph' ? 'bg-[#1e1e1e] border-t-2 border-t-blue-500' : 'bg-[#2d2d2d] border-t-2 border-t-transparent hover:bg-[#252526]'}`}>
                    <Network className="w-4 h-4 text-blue-400 opacity-80" />
                    <span className={`text-sm font-semibold ${activeFileId === 'graph' ? 'text-gray-200' : 'text-gray-400'}`}>Dependency Graph</span>
                  </div>
                )}

                {openTabs.map(tabId => {
                  const tabFile = files.find(f => f.id === tabId) || inputFiles.find(f => f.id === tabId);
                  if (!tabFile) return null;
                  const isActive = activeFileId === tabId;
                  return (
                    <div key={tabId} onClick={() => setActiveFileId(tabId)} className={`flex items-center gap-2 px-3 py-2 min-w-[120px] max-w-[200px] cursor-pointer border-r border-[#3c3c3c] group transition-colors ${isActive ? 'bg-[#1e1e1e] border-t-2 border-t-green-500' : 'bg-[#2d2d2d] border-t-2 border-t-transparent hover:bg-[#252526]'}`}>
                      {tabFile.type === 'json' ? <FileJson className="w-4 h-4 text-yellow-400 opacity-80 flex-shrink-0" /> : <FileCode className="w-4 h-4 text-gray-400 opacity-80 flex-shrink-0" />}
                      <span className={`text-sm truncate select-none flex-1 ${isActive ? 'text-gray-200' : 'text-gray-400'}`}>{tabFile.name}</span>
                      <button onClick={(e) => closeTab(e, tabId)} className={`p-0.5 rounded-md hover:bg-[#4c4c4c] transition-colors ml-1 flex-shrink-0 ${isActive ? 'opacity-100 text-gray-400 hover:text-white' : 'opacity-0 group-hover:opacity-100 text-gray-500'}`}>
                        <X className="w-3.5 h-3.5 cursor-pointer" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center px-2">
                <button onClick={toggleEditor} className="text-gray-400 hover:text-white transition-colors p-1.5 rounded hover:bg-white/10 flex-shrink-0">
                  {isEditorExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4 cursor-pointer" />}
                </button>
              </div>
            </div>

            {/* 🚀 Editor / Graph Content Area */}
            <div className="flex-1 overflow-auto p-0 relative flex flex-col">
              {activeFileId === 'graph' ? (
                <>
                  {/* 🚀 NEW: Top Banner showing the calculated execution path */}
                  {executionOrder.length > 0 && (
                    <div className="bg-[#161b22] border-b border-[#3c3c3c] px-4 py-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap z-10 shadow-sm">
                      <span className="text-gray-400 font-semibold text-xs tracking-wider uppercase mr-2 flex-shrink-0">
                        Topological Sort Sequence:
                      </span>
                      {executionOrder.map((name, index) => (
                        <React.Fragment key={name}>
                          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide">
                            {name}
                          </span>
                          {index < executionOrder.length - 1 && (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  <div style={{ flex: 1, width: '100%', minHeight: '300px' }}>
                    {/* 🚀 Removed the <Controls /> component completely */}
                    <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} maxZoom={2}>
                      <Background color="#444" gap={16} />
                    </ReactFlow>
                  </div>
                </>
              ) : activeFile ? (
                <div className="p-4">
                  <pre className="font-mono text-sm text-gray-300">
                    <code>{activeFile.content}</code>
                  </pre>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                  <FileCode className="w-12 h-12 mb-4 opacity-20" />
                  <p>Select a file to view its contents</p>
                </div>
              )}
            </div>
          </div>

          {/* Terminal */}
          <div className={`bg-[#0d1117] border border-[var(--color-border)] rounded-xl flex-col overflow-hidden shadow-lg transition-all duration-300 ${isTerminalExpanded ? 'absolute inset-0 z-30 h-full' : 'h-45 flex-shrink-0'} ${isEditorExpanded ? 'hidden' : 'flex'}`}>
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
              <div className="flex items-center gap-2 text-gray-400">
                <Terminal className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Output Console</span>
              </div>
              <button onClick={toggleTerminal} className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10">
                {isTerminalExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4 cursor-pointer" />}
              </button>
            </div>

            <div ref={terminalRef} className="flex-1 p-4 font-mono text-sm overflow-y-auto">
              {logs.map((log, i) => {
                let colorClass = "text-gray-300";
                if (log.includes('✅') || log.includes('🟢')) colorClass = "text-green-400";
                if (log.includes('❌') || log.includes('⚠️')) colorClass = "text-red-400";
                if (log.includes('🧠') || log.includes('🚀')) colorClass = "text-blue-400";
                if (log.includes('⏳') || log.includes('🔄')) colorClass = "text-yellow-400";

                return (
                  <div key={i} className="mb-1 flex">
                    <span className="text-gray-600 mr-4 select-none flex-shrink-0">
                      {new Date().toISOString().substring(11, 19)}
                    </span>
                    <span className={colorClass}>{log}</span>
                  </div>
                );
              })}
              {isProcessing && (
                <div className="mt-4 flex items-center text-gray-400 animate-pulse">
                  <ChevronRight className="w-4 h-4" />
                  <span className="w-2 h-4 bg-gray-400 ml-1"></span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
};

export default Output;