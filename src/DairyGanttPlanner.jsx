import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Calendar, Clock, Truck, Milk, User, Briefcase, PlusCircle, Search, Save, Download, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

// --- Configuration Strategy ---
const getFirebaseConfig = () => {
  // 1. Canvas Environment
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }
  
  // 2. Vite / Netlify Environment
  try {
    if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
      return {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID
      };
    }
  } catch (e) {
    console.log("Not running in Vite environment");
  }

  return null;
};

const firebaseConfig = getFirebaseConfig();

// Initialize Firebase only if config is found
let app, auth, db;
if (firebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'dairy-planner-production';

const DairyGanttPlanner = () => {
  // --- Configuration ---
  const START_HOUR = 2; // Starts at 2:00 AM
  const END_HOUR = 22;  // 10 PM
  const TOTAL_HOURS = END_HOUR - START_HOUR;

  // --- State ---
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null); // Track saving errors
  const [tasks, setTasks] = useState([
    { id: 1, resource: 'Team A', task: 'Morning Milking', start: '02:30', end: '05:30' },
    { id: 2, resource: 'Tanker 1', task: 'Milk Collection', start: '05:00', end: '06:30' },
    { id: 3, resource: 'Processing', task: 'Pasteurization', start: '06:00', end: '09:00' },
    { id: 4, resource: 'Team B', task: 'Feeding Cows', start: '09:00', end: '10:30' },
    { id: 5, resource: 'Dr. Smith', task: 'Vet Inspection', start: '10:00', end: '12:00' },
    { id: 6, resource: 'Logistics', task: 'City Delivery', start: '11:30', end: '15:30' },
    { id: 7, resource: 'Team A', task: 'Evening Milking', start: '16:00', end: '19:00' },
    { id: 8, resource: 'Cleaning', task: 'Equipment Sanitize', start: '19:30', end: '21:00' },
  ]);

  const [newTask, setNewTask] = useState({
    resource: '',
    task: '',
    start: '08:00',
    end: '09:00'
  });

  const [filterText, setFilterText] = useState('');
  const fileInputRef = useRef(null);

  // --- Firebase Auth & Data Sync ---

  // 1. Authenticate
  useEffect(() => {
    if (!auth) return;
    
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Auth Error:", e);
        setSaveError("Auth Failed: Check console");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Sync Data (Load & Listen)
  useEffect(() => {
    if (!user || !db) return;

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'day_planner_data', 'schedule');

    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.tasks) {
          setTasks(data.tasks);
        }
      } else {
        saveTasksToCloud(tasks);
      }
      setSaveError(null); // Clear errors on successful read
    }, (error) => {
      console.error("Sync Error:", error);
      if (error.code === 'permission-denied') {
        setSaveError("Permission Denied: Check Firestore Rules");
      } else {
        setSaveError("Database Error: Did you create the Firestore Database in Console?");
      }
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Save Helper
  const saveTasksToCloud = async (updatedTasks) => {
    if (!user || !db) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'day_planner_data', 'schedule'), {
        tasks: updatedTasks,
        lastUpdated: Date.now()
      });
    } catch (e) {
      console.error("Save Error:", e);
      setSaveError("Save Failed");
    } finally {
      setTimeout(() => setIsSaving(false), 800);
    }
  };

  const updateTasks = (newTaskList) => {
    setTasks(newTaskList);
    saveTasksToCloud(newTaskList);
  };

  // --- Logic Helpers ---

  // Generate a consistent color based on the resource string
  const getResourceColor = (resourceName) => {
    if (!resourceName) return 'bg-slate-400';
    
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-indigo-500', 'bg-yellow-500', 
      'bg-red-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 
      'bg-orange-500', 'bg-cyan-600', 'bg-lime-600', 'bg-rose-500'
    ];
    
    let hash = 0;
    for (let i = 0; i < resourceName.length; i++) {
      hash = resourceName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const timeToDecimal = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
  };

  const hoursArray = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  const filteredTasks = tasks.filter(task => 
    task.resource.toLowerCase().includes(filterText.toLowerCase())
  );
  
  // Get Unique Resources for Legend
  const uniqueResources = Array.from(new Set(tasks.map(t => t.resource))).filter(Boolean).sort();

  // --- Event Handlers ---

  const handleTaskChange = (id, field, value) => {
    const updated = tasks.map(t => t.id === id ? { ...t, [field]: value } : t);
    updateTasks(updated);
  };

  const insertTask = (targetTaskId) => {
    const newId = Date.now();
    const emptyTask = {
      id: newId,
      resource: filterText || '',
      task: '',
      start: '08:00',
      end: '09:00'
    };
    
    const index = tasks.findIndex(t => t.id === targetTaskId);
    if (index === -1) return;

    const updatedTasks = [...tasks];
    updatedTasks.splice(index + 1, 0, emptyTask);
    updateTasks(updatedTasks);
  };

  const addTask = () => {
    if (!newTask.resource && !filterText) return; 
    
    const id = Date.now();
    const taskToAdd = {
      ...newTask,
      id,
      resource: newTask.resource || filterText
    };

    const updatedTasks = [...tasks, taskToAdd];
    updateTasks(updatedTasks);
    setNewTask({ resource: '', task: '', start: '08:00', end: '09:00' });
  };

  const deleteTask = (id) => {
    const updated = tasks.filter(t => t.id !== id);
    updateTasks(updated);
  };

  // --- Export / Import CSV ---
  
  const exportToCSV = () => {
    const headers = ['Resource,Task,Start Time,End Time'];
    const rows = tasks.map(t => `${t.resource},"${t.task}",${t.start},${t.end}`);
    const csvContent = [headers, ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dairy_plan_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerImport = () => {
    fileInputRef.current.click();
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n');
      const newTasks = [];
      let successCount = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const regex = /^(.*?),(?:\"([^\"]*)\"|([^,]*)),(.*?),(.*?)$/;
        const matches = line.match(regex);

        if (matches) {
            const taskName = matches[2] || matches[3] || "Unnamed Task";

            newTasks.push({
                id: Date.now() + i,
                resource: matches[1].trim(),
                task: taskName.trim(),
                start: matches[4].trim(),
                end: matches[5].trim()
            });
            successCount++;
        }
      }
      
      if (newTasks.length > 0) {
          if(confirm(`Successfully parsed ${successCount} tasks. Replace current schedule?`)) {
             updateTasks(newTasks);
          }
      } else {
          alert("Could not parse CSV. Ensure format is: Resource,Task,Start,End");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const TaskBar = ({ start, end, color, taskName }) => {
    const startDec = timeToDecimal(start);
    const endDec = timeToDecimal(end);
    let leftPct = ((startDec - START_HOUR) / TOTAL_HOURS) * 100;
    let widthPct = ((endDec - startDec) / TOTAL_HOURS) * 100;

    if (leftPct < 0) { widthPct += leftPct; leftPct = 0; }
    if (leftPct + widthPct > 100) { widthPct = 100 - leftPct; }

    if (widthPct <= 0) return null;

    return (
      <div 
        className={`absolute h-6 rounded ${color} shadow-sm flex items-center px-2 overflow-hidden whitespace-nowrap text-xs text-white font-medium transition-all duration-300`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%`, top: '50%', transform: 'translateY(-50%)' }}
        title={`${taskName}: ${start} - ${end}`}
      >
        {widthPct > 5 && <span className="truncate">{taskName}</span>}
      </div>
    );
  };

  // Environment Check
  if (!firebaseConfig) {
      return (
        <div className="flex h-screen items-center justify-center bg-slate-100 flex-col gap-4 p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-800">Configuration Missing</h1>
            <p className="text-slate-600 max-w-md">
                No Firebase configuration found. <br/><br/>
                <strong>Deployed on Netlify?</strong> Add Environment Variables in Site Settings.
            </p>
        </div>
      )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Milk className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">DairyOps Scheduler</h1>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        
        <div className="flex-1 max-w-md mx-4">
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all shadow-sm"
                    placeholder="Filter by Resource Name..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                />
                {filterText && (
                    <button 
                        onClick={() => setFilterText('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                        <span className="text-xs font-bold">✕</span>
                    </button>
                )}
            </div>
        </div>

        <div className="flex items-center gap-3">
           {isSaving && (
             <span className="text-xs text-green-600 font-medium flex items-center gap-1 animate-pulse mr-2">
               <Save className="w-3 h-3" /> Saving...
             </span>
           )}
           <button onClick={triggerImport} className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-md text-sm font-medium shadow-sm transition-colors flex items-center gap-2">
             <Upload className="w-4 h-4" /> Import
           </button>
           <button onClick={exportToCSV} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors flex items-center gap-2">
             <Download className="w-4 h-4" /> Export
           </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[480px] flex flex-col border-r border-slate-300 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
          <div className="h-12 bg-slate-100 border-b border-slate-300 flex items-center text-xs font-bold text-slate-600 uppercase tracking-wider">
            <div className="w-10 text-center">#</div>
            <div className="flex-1 px-3 border-l border-slate-200">Resource</div>
            <div className="flex-1 px-3 border-l border-slate-200">Task</div>
            <div className="w-20 px-2 border-l border-slate-200 text-center">Start</div>
            <div className="w-20 px-2 border-l border-slate-200 text-center">End</div>
            <div className="w-16 border-l border-slate-200 text-center">Actions</div>
          </div>

          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {filteredTasks.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                    No resources found matching "{filterText}"
                </div>
            ) : (
                filteredTasks.map((task, index) => (
                <div key={task.id} className="h-12 border-b border-slate-100 flex items-center hover:bg-slate-50 text-sm group">
                    <div className="w-10 text-center text-slate-400 text-xs">{index + 1}</div>
                    <div className="flex-1 px-2 border-l border-slate-100 h-full flex items-center">
                    <input type="text" value={task.resource} onChange={(e) => handleTaskChange(task.id, 'resource', e.target.value)} className="w-full bg-transparent border-none focus:ring-0 p-0 text-slate-700 font-medium" />
                    </div>
                    <div className="flex-1 px-2 border-l border-slate-100 h-full flex items-center">
                    <input type="text" value={task.task} onChange={(e) => handleTaskChange(task.id, 'task', e.target.value)} className="w-full bg-transparent border-none focus:ring-0 p-0 text-slate-600" />
                    </div>
                    <div className="w-20 px-1 border-l border-slate-100 h-full flex items-center justify-center">
                    <input type="time" value={task.start} onChange={(e) => handleTaskChange(task.id, 'start', e.target.value)} className="bg-transparent text-xs text-center border-none focus:ring-0 p-0 w-full cursor-pointer" />
                    </div>
                    <div className="w-20 px-1 border-l border-slate-100 h-full flex items-center justify-center">
                    <input type="time" value={task.end} onChange={(e) => handleTaskChange(task.id, 'end', e.target.value)} className="bg-transparent text-xs text-center border-none focus:ring-0 p-0 w-full cursor-pointer" />
                    </div>
                    <div className="w-16 border-l border-slate-100 h-full flex items-center justify-center gap-1">
                    <button onClick={() => insertTask(task.id)} title="Insert Row Below" className="text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all p-1"><PlusCircle className="w-4 h-4" /></button>
                    <button onClick={() => deleteTask(task.id)} title="Delete Row" className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                </div>
                ))
            )}

            <div className="h-12 border-b border-slate-100 flex items-center bg-blue-50/50">
                <div className="w-10 flex justify-center text-blue-400"><Plus className="w-4 h-4"/></div>
                <div className="flex-1 px-2 border-l border-blue-100">
                  <input placeholder="New Resource..." className="w-full bg-transparent border-none text-sm placeholder:text-blue-300 focus:ring-0" value={newTask.resource} onChange={(e) => setNewTask({...newTask, resource: e.target.value})} />
                </div>
                <div className="flex-1 px-2 border-l border-blue-100">
                  <input placeholder="New Task..." className="w-full bg-transparent border-none text-sm placeholder:text-blue-300 focus:ring-0" value={newTask.task} onChange={(e) => setNewTask({...newTask, task: e.target.value})} />
                </div>
                <div className="w-40 px-2 border-l border-blue-100 flex justify-center">
                  <button onClick={addTask} className="text-xs bg-blue-100 text-blue-600 hover:bg-blue-200 px-3 py-1 rounded font-medium transition-colors">Add Row</button>
                </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
          <div className="h-12 bg-slate-50 border-b border-slate-300 flex relative min-w-[800px]">
            {hoursArray.map((hour, i) => (
              <div key={hour} className="flex-1 border-l border-slate-200 text-[10px] text-slate-400 font-medium p-1 flex items-end justify-center pb-2 select-none">{hour}:00</div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-auto relative min-w-[800px] custom-scrollbar">
            <div className="absolute inset-0 flex pointer-events-none">
              {hoursArray.map((hour) => (
                <div key={`grid-${hour}`} className="flex-1 border-l border-slate-100 h-full"></div>
              ))}
            </div>
            
            {/* Hypothetical Current Time: 04:15 AM (adjusted for visual testing) */}
             <div className="absolute top-0 bottom-0 border-l-2 border-red-400 border-dashed z-20 pointer-events-none opacity-50" style={{ left: `${((4.25 - START_HOUR) / TOTAL_HOURS) * 100}%` }}>
              <div className="bg-red-500 text-white text-[9px] px-1 rounded absolute -top-0 -left-6">04:15</div>
            </div>

            {filteredTasks.length === 0 ? <div className="h-20"></div> : filteredTasks.map((task) => (
                <div key={`gantt-${task.id}`} className="h-12 border-b border-slate-100 relative w-full hover:bg-slate-50 transition-colors">
                    <TaskBar start={task.start} end={task.end} color={getResourceColor(task.resource)} taskName={task.task} />
                </div>
            ))}
            <div className="h-full w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2YxZjVZjkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIgLz48L3N2Zz4=')] opacity-50"></div>
          </div>
        </div>
      </div>
      
      <div className="bg-white border-t border-slate-200 px-6 py-2 text-xs text-slate-500 flex items-center justify-between">
         <div className="flex gap-4">
            {/* Status Indicators */}
            {saveError ? (
               <span className="flex items-center gap-1 text-red-600 font-bold animate-pulse">
                 <AlertCircle className="w-3 h-3" /> {saveError}
               </span>
            ) : user ? (
               <span className="flex items-center gap-1 text-green-600 font-medium">
                 <CheckCircle2 className="w-3 h-3" /> Database Connected
               </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-400">
                 Connecting...
               </span>
            )}
         </div>
         {/* Dynamic Resource Legend */}
         <div className="flex gap-4 overflow-x-auto max-w-[60%] custom-scrollbar pb-1">
            {uniqueResources.map(res => (
              <span key={res} className="flex items-center gap-1 whitespace-nowrap">
                <span className={`w-3 h-3 rounded-sm ${getResourceColor(res)}`}></span> 
                {res}
              </span>
            ))}
         </div>
      </div>
    </div>
  );
};

export default DairyGanttPlanner;