/**
 * 小习惯管家 - 儿童任务管理APP
 * 主要功能：任务管理、语音提醒、倒计时、成就系统
 * PWA支持：离线使用、添加到主屏幕、推送通知
 */

// ========================================
// PWA - Service Worker 注册
// ========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('Service Worker 注册成功:', registration.scope);
                
                // 请求通知权限
                if ('Notification' in window) {
                    Notification.requestPermission().then((permission) => {
                        if (permission === 'granted') {
                            console.log('通知权限已获取');
                        }
                    });
                }
            })
            .catch((error) => {
                console.log('Service Worker 注册失败:', error);
            });
    });
}

// ========================================
// 全局状态管理
// ========================================
const AppState = {
    tasks: [],
    totalStars: 0,
    streakDays: 0,
    completedTasks: 0,
    currentTheme: 'pink',
    voiceEnabled: true,
    soundEnabled: true,
    notificationEnabled: true,
    editingTaskId: null,
    countdownInterval: null,
    currentCountdownTask: null,
    voiceSettings: {
        speed: 1,
        pitch: 1
    }
};

// ========================================
// 自定义录音管理
// ========================================
const CustomRecordings = {
    recordings: [],
    mediaRecorder: null,
    audioChunks: [],
    currentRecording: null,
    recordingStartTime: null,
    recordingTimer: null,
    
    // 加载保存的录音
    load() {
        const saved = localStorage.getItem('customRecordings');
        if (saved) {
            this.recordings = JSON.parse(saved);
        }
        return this.recordings;
    },
    
    // 保存录音列表
    save() {
        localStorage.setItem('customRecordings', JSON.stringify(this.recordings));
    },
    
    // 添加新录音
    add(name, audioBlob, duration) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const recording = {
                    id: Date.now(),
                    name: name,
                    audioData: reader.result,
                    duration: duration,
                    createdAt: new Date().toISOString()
                };
                this.recordings.push(recording);
                this.save();
                resolve(recording);
            };
            reader.readAsDataURL(audioBlob);
        });
    },
    
    // 删除录音
    delete(id) {
        this.recordings = this.recordings.filter(r => r.id !== id);
        this.save();
    },
    
    // 获取录音
    get(id) {
        return this.recordings.find(r => r.id === id);
    },
    
    // 获取所有录音
    getAll() {
        return this.recordings;
    },
    
    // 播放录音
    play(id) {
        const recording = this.get(id);
        if (recording) {
            const audio = new Audio(recording.audioData);
            audio.play();
            return audio;
        }
        return null;
    }
};

// 语音角色配置
// 音频文件映射 - 根据任务内容匹配音频
const AudioFiles = {
    // 角色 -> 任务内容 -> 音频文件
    'labixiaoxin': {
        'default': 'audio/voices/labixiaoxin起床.mp3',
        '起床': 'audio/voices/labixiaoxin起床.mp3',
        '睡觉': 'audio/voices/labixiaoxin起床.mp3',
        '洗漱': 'audio/voices/labixiaoxin起床.mp3'
    },
    'tvb': {
        'default': 'audio/voices/TVB女声洗牙套.mp3',
        '洗牙套': 'audio/voices/TVB女声洗牙套.mp3',
        '刷牙': 'audio/voices/TVB女声洗牙套.mp3',
        '洗脸': 'audio/voices/TVB女声洗牙套.mp3'
    },
    'ertong': {
        'default': 'audio/voices/儿童上学.mp3',
        '上学': 'audio/voices/儿童上学.mp3',
        '去上学': 'audio/voices/儿童上学.mp3',
        '出门': 'audio/voices/儿童上学.mp3'
    },
    'xiaodaji': {
        'default': 'audio/voices/动漫小妲己换衣服.mp3',
        '换衣服': 'audio/voices/动漫小妲己换衣服.mp3',
        '穿衣服': 'audio/voices/动漫小妲己换衣服.mp3',
        '打扮': 'audio/voices/动漫小妲己换衣服.mp3'
    },
    'nezha': {
        'default': 'audio/voices/挪吒吃饭.mp3',
        '吃饭': 'audio/voices/挪吒吃饭.mp3',
        '用餐': 'audio/voices/挪吒吃饭.mp3',
        '吃东西': 'audio/voices/挪吒吃饭.mp3'
    },
    'manbo': {
        'default': 'audio/voices/曼波女声刷牙洗脸.mp3',
        '刷牙': 'audio/voices/曼波女声刷牙洗脸.mp3',
        '洗脸': 'audio/voices/曼波女声刷牙洗脸.mp3',
        '洗漱': 'audio/voices/曼波女声刷牙洗脸.mp3'
    },
    'xiaowanzi': {
        'default': 'audio/voices/樱桃小丸子念书.mp3',
        '念书': 'audio/voices/樱桃小丸子念书.mp3',
        '读书': 'audio/voices/樱桃小丸子念书.mp3',
        '学习': 'audio/voices/樱桃小丸子念书.mp3',
        '写作业': 'audio/voices/樱桃小丸子念书.mp3'
    },
    'xiaohaixiezuoye': {
        'default': 'audio/voices/小孩写作业啦.mp3',
        '写作业': 'audio/voices/小孩写作业啦.mp3',
        '做作业': 'audio/voices/小孩写作业啦.mp3',
        '学习': 'audio/voices/小孩写作业啦.mp3',
        '读书': 'audio/voices/小孩写作业啦.mp3'
    },
    'shimengyundong': {
        'default': 'audio/voices/诗萌去运动咯.mp3',
        '运动': 'audio/voices/诗萌去运动咯.mp3',
        '锻炼': 'audio/voices/诗萌去运动咯.mp3',
        '健身': 'audio/voices/诗萌去运动咯.mp3',
        '跑步': 'audio/voices/诗萌去运动咯.mp3'
    }
};

const VoiceCharacters = {
    // 角色配置
    'labixiaoxin': { 
        name: '蜡笔小新', 
        avatar: '�', 
        desc: '调皮可爱 · 起床提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    },
    'tvb': { 
        name: 'TVB女声', 
        avatar: '📺', 
        desc: '港剧风格 · 洗漱提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    },
    'ertong': { 
        name: '儿童', 
        avatar: '🧒', 
        desc: '天真活泼 · 上学提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    },
    'xiaodaji': { 
        name: '动漫小妲己', 
        avatar: '🦊', 
        desc: '甜美可爱 · 穿衣提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    },
    'nezha': { 
        name: '哪吒', 
        avatar: '👶', 
        desc: '酷酷的少年音 · 吃饭提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    },
    'manbo': { 
        name: '曼波女声', 
        avatar: '🎵', 
        desc: '温柔动听 · 洗漱提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    },
    'xiaowanzi': { 
        name: '樱桃小丸子', 
        avatar: '👧', 
        desc: '呆萌可爱 · 学习提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    },
    'xiaohaixiezuoye': { 
        name: '小孩', 
        avatar: '✏️', 
        desc: '活泼可爱 · 写作业提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    },
    'shimengyundong': { 
        name: '诗萌', 
        avatar: '🏃', 
        desc: '元气满满 · 运动提醒', 
        rate: 1.0, pitch: 1.0, volume: 1.0
    }
};

// 根据任务名称获取对应的音频文件
function getAudioFile(voiceKey, taskName) {
    const voiceAudios = AudioFiles[voiceKey];
    if (!voiceAudios) return null;
    
    // 尝试匹配任务名称关键词
    for (const [keyword, file] of Object.entries(voiceAudios)) {
        if (keyword !== 'default' && taskName.includes(keyword)) {
            return file;
        }
    }
    
    // 返回默认音频
    return voiceAudios['default'];
}

// 任务图标选项
const TaskIcons = ['🎒', '📚', '🧸', '🎨', '🎹', '🧹', '🛁', '🛏️'];

// ========================================
// 初始化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // 检查是否需要清除旧数据（版本更新时）
    const currentVersion = '2.1';
    const savedVersion = localStorage.getItem('appVersion');
    if (savedVersion !== currentVersion) {
        // 清除旧数据
        localStorage.removeItem('habitManagerData');
        localStorage.removeItem('triggeredAlerts');
        localStorage.setItem('appVersion', currentVersion);
        console.log('应用已更新，清除旧数据');
    }
    
    loadData();
    loadTriggeredAlerts(); // 加载已触发的提醒记录
    CustomRecordings.load(); // 加载自定义录音
    initEventListeners();
    renderTaskList();
    updateStats();
    checkTasksStatus();
    
    // 初始化移动端音频支持
    initAudioForMobile();
    
    // 渲染自定义录音选项
    renderCustomVoiceOptions();
    
    // 每10秒检查一次任务状态，更精确
    setInterval(checkTasksStatus, 10000);
    
    console.log('小习惯管家已启动！当前时间:', new Date().toLocaleTimeString());
    console.log('当前任务数:', AppState.tasks.length);
    console.log('设备类型:', /Mobile|Android|iPhone/i.test(navigator.userAgent) ? '移动端' : '电脑端');
}

// ========================================
// 数据持久化
// ========================================
function saveData() {
    const data = {
        tasks: AppState.tasks,
        totalStars: AppState.totalStars,
        streakDays: AppState.streakDays,
        completedTasks: AppState.completedTasks,
        currentTheme: AppState.currentTheme,
        voiceEnabled: AppState.voiceEnabled,
        soundEnabled: AppState.soundEnabled,
        notificationEnabled: AppState.notificationEnabled
    };
    localStorage.setItem('habitManagerData', JSON.stringify(data));
}

function loadData() {
    const saved = localStorage.getItem('habitManagerData');
    if (saved) {
        const data = JSON.parse(saved);
        AppState.tasks = data.tasks || [];
        AppState.totalStars = data.totalStars || 0;
        AppState.streakDays = data.streakDays || 0;
        AppState.completedTasks = data.completedTasks || 0;
        AppState.currentTheme = data.currentTheme || 'pink';
        AppState.voiceEnabled = data.voiceEnabled !== false;
        AppState.soundEnabled = data.soundEnabled !== false;
        AppState.notificationEnabled = data.notificationEnabled !== false;
        
        // 应用主题
        document.documentElement.setAttribute('data-theme', AppState.currentTheme);
        updateThemeUI();
    } else {
        // 初始化示例数据
        initSampleData();
    }
}

function initSampleData() {
    // 初始化空数据，不添加示例任务
    AppState.tasks = [];
    AppState.totalStars = 0;
    AppState.streakDays = 0;
    AppState.completedTasks = 0;
    saveData();
}

// ========================================
// 页面导航
// ========================================
function showPage(pageId, options = {}) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // 显示目标页面
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        
        // 特殊页面处理
        if (pageId === 'task-edit-page' && !options.skipInit) {
            initEditPage();
        } else if (pageId === 'achievement-page') {
            updateAchievementPage();
        } else if (pageId === 'settings-page') {
            updateSettingsPage();
        }
    }
    
    // 滚动到顶部
    window.scrollTo(0, 0);
}

// ========================================
// 任务列表渲染
// ========================================
function renderTaskList() {
    const taskList = document.getElementById('task-list');
    const emptyState = document.getElementById('empty-state');
    const todayTaskCount = document.getElementById('today-task-count');
    
    // 更新今日任务数量
    const pendingCount = AppState.tasks.filter(t => t.status !== 'completed').length;
    todayTaskCount.textContent = pendingCount;
    
    if (AppState.tasks.length === 0) {
        taskList.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // 按时间排序
    const sortedTasks = [...AppState.tasks].sort((a, b) => {
        return a.startTime.localeCompare(b.startTime);
    });
    
    taskList.innerHTML = sortedTasks.map(task => createTaskCardHTML(task)).join('');
}

function createTaskCardHTML(task) {
    // 获取语音显示名称
    let voiceDisplayName;
    if (task.voice && task.voice.startsWith('custom_')) {
        const recordingId = task.voice.replace('custom_', '');
        const recording = CustomRecordings.get(parseInt(recordingId));
        voiceDisplayName = recording ? `🎙️ ${recording.name}` : '🎙️ 自定义录音';
    } else {
        const voiceChar = VoiceCharacters[task.voice] || VoiceCharacters['labixiaoxin'];
        voiceDisplayName = `🔊 ${voiceChar.name}`;
    }
    
    const statusClass = task.status || 'pending';
    const statusText = {
        'pending': '未开始',
        'in-progress': '进行中',
        'completed': '已完成'
    }[statusClass];
    
    // 计算倒计时开始时间
    const [endHour, endMinute] = task.endTime.split(':').map(Number);
    const countdownMinutes = task.countdownTime || 5;
    const countdownStartMinute = endMinute - countdownMinutes;
    const countdownStartHour = countdownStartMinute < 0 ? endHour - 1 : endHour;
    const adjustedStartMinute = countdownStartMinute < 0 ? 60 + countdownStartMinute : countdownStartMinute;
    const countdownStartTime = `${String(countdownStartHour).padStart(2, '0')}:${String(adjustedStartMinute).padStart(2, '0')}`;
    
    return `
        <div class="task-card ${statusClass}" data-task-id="${task.id}">
            <div class="task-header">
                <div class="task-icon">${task.icon}</div>
                <div class="task-info">
                    <div class="task-name">${task.name}</div>
                    <div class="task-time">
                        🕐 ${task.startTime} - ${task.endTime}
                        <span style="margin-left: 8px;">${voiceDisplayName}</span>
                        ${task.countdownEnabled ? `<span style="margin-left: 8px; color: var(--warning-color);">⏰ ${countdownStartTime}提醒</span>` : ''}
                    </div>
                </div>
                <div class="task-status ${statusClass}">${statusText}</div>
            </div>
            <div class="task-actions">
                ${statusClass !== 'completed' ? `
                    <button class="task-btn complete" onclick="completeTask(${task.id})">
                        ✓ 完成
                    </button>
                ` : ''}
                <button class="task-btn edit" onclick="editTask(${task.id})">
                    ✎ 编辑
                </button>
                <button class="task-btn delete" onclick="deleteTask(${task.id})">
                    ✕ 删除
                </button>
            </div>
        </div>
    `;
}

// ========================================
// 任务管理
// ========================================
function initEditPage() {
    // 重置表单
    document.getElementById('task-name').value = '';
    document.getElementById('start-time').value = '19:00';
    document.getElementById('end-time').value = '19:20';
    document.getElementById('voice-content').value = '';
    document.getElementById('recording-prompt').value = '';
    document.getElementById('enable-countdown').checked = false;
    document.getElementById('countdown-options').classList.add('hidden');
    
    // 重置录音UI
    document.getElementById('start-record-btn').style.display = 'flex';
    document.getElementById('stop-record-btn').style.display = 'none';
    document.getElementById('play-record-btn').style.display = 'none';
    document.getElementById('save-record-btn').style.display = 'none';
    document.getElementById('recording-status').style.display = 'none';
    document.getElementById('recording-timer').style.display = 'none';
    
    // 重置图标选择
    document.querySelectorAll('.icon-option').forEach((opt, idx) => {
        opt.classList.toggle('selected', idx === 0);
    });
    
    // 重置语音选择 - 默认选中蜡笔小新
    document.querySelectorAll('.voice-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.voice === 'labixiaoxin');
    });
    
    // 更新页面标题和按钮文本
    document.getElementById('edit-page-title').textContent = '添加新任务';
    document.getElementById('save-btn-text').textContent = '保存任务';
    
    // 更新选中的语音显示
    updateSelectedVoiceDisplay();
    
    // 渲染已保存的录音列表
    renderSavedRecordings();
    
    AppState.editingTaskId = null;
}

function updateSelectedVoiceDisplay() {
    const selectedVoice = document.querySelector('.voice-option.selected');
    const display = document.getElementById('selected-voice-display');
    if (selectedVoice && display) {
        const voiceKey = selectedVoice.dataset.voice;
        const voiceChar = VoiceCharacters[voiceKey];
        display.textContent = voiceChar ? `${voiceChar.avatar} ${voiceChar.name}` : '选择语音角色';
    }
}

function showVoiceSelector() {
    // 语音选择器已经在页面中显示，点击会触发选择
    const voiceOptions = document.getElementById('voice-options-list');
    if (voiceOptions) {
        voiceOptions.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function editTask(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    AppState.editingTaskId = taskId;
    
    // 填充表单
    document.getElementById('task-name').value = task.name;
    document.getElementById('start-time').value = task.startTime;
    document.getElementById('end-time').value = task.endTime;
    document.getElementById('voice-content').value = task.voiceContent || '';
    document.getElementById('recording-prompt').value = '';
    document.getElementById('enable-countdown').checked = task.countdownEnabled;
    document.getElementById('countdown-options').classList.toggle('hidden', !task.countdownEnabled);
    
    // 重置录音UI
    document.getElementById('start-record-btn').style.display = 'flex';
    document.getElementById('stop-record-btn').style.display = 'none';
    document.getElementById('play-record-btn').style.display = 'none';
    document.getElementById('save-record-btn').style.display = 'none';
    document.getElementById('recording-status').style.display = 'none';
    document.getElementById('recording-timer').style.display = 'none';
    
    // 设置倒计时选项
    if (task.countdownTime) {
        const radio = document.querySelector(`input[name="countdown-time"][value="${task.countdownTime}"]`);
        if (radio) radio.checked = true;
    }
    
    // 设置图标
    document.querySelectorAll('.icon-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.icon === task.icon);
    });
    
    // 设置语音
    document.querySelectorAll('.voice-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.voice === task.voice);
    });
    
    // 更新页面标题和按钮文本
    document.getElementById('edit-page-title').textContent = '编辑任务';
    document.getElementById('save-btn-text').textContent = '保存修改';
    
    // 更新选中的语音显示
    updateSelectedVoiceDisplay();
    
    // 渲染已保存的录音列表
    renderSavedRecordings();
    
    // 跳转到编辑页面，跳过初始化（保留填充的数据）
    showPage('task-edit-page', { skipInit: true });
}

function saveTask() {
    const name = document.getElementById('task-name').value.trim();
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    const voiceContent = document.getElementById('voice-content').value.trim();
    const countdownEnabled = document.getElementById('enable-countdown').checked;
    const countdownTime = document.querySelector('input[name="countdown-time"]:checked')?.value || 5;
    
    // 获取选中的图标
    const selectedIcon = document.querySelector('.icon-option.selected')?.dataset.icon || '🎒';
    
    // 获取选中的语音 - 默认蜡笔小新
    const selectedVoice = document.querySelector('.voice-option.selected')?.dataset.voice || 'labixiaoxin';
    
    // 验证
    if (!name) {
        showToast('请输入任务名称哦～');
        return;
    }
    
    if (!startTime || !endTime) {
        showToast('请设置开始和结束时间～');
        return;
    }
    
    const taskData = {
        name,
        icon: selectedIcon,
        startTime,
        endTime,
        voice: selectedVoice,
        voiceContent: voiceContent || getDefaultVoiceContent(name, selectedVoice),
        countdownEnabled,
        countdownTime: parseInt(countdownTime),
        status: 'pending'
    };
    
    if (AppState.editingTaskId) {
        // 更新现有任务
        const index = AppState.tasks.findIndex(t => t.id === AppState.editingTaskId);
        if (index !== -1) {
            AppState.tasks[index] = { ...AppState.tasks[index], ...taskData };
        }
    } else {
        // 创建新任务
        const newTask = {
            id: Date.now(),
            ...taskData,
            createdAt: Date.now()
        };
        AppState.tasks.push(newTask);
    }
    
    saveData();
    renderTaskList();
    showPage('home-page');
    showToast(AppState.editingTaskId ? '任务修改成功！' : '新任务添加成功！');
}

function getDefaultVoiceContent(taskName, voice) {
    const charName = VoiceCharacters[voice]?.name || '蜡笔小新';
    // 蜡笔小新的风格语气
    if (voice === 'labixiaoxin') {
        return `嘿嘿，该${taskName}啦～快点快点！`;
    }
    return `宝贝，该${taskName}啦～`;
}

function deleteTask(taskId) {
    if (!confirm('确定要删除这个任务吗？')) return;
    
    AppState.tasks = AppState.tasks.filter(t => t.id !== taskId);
    saveData();
    renderTaskList();
    showToast('任务已删除');
}

function completeTask(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    task.status = 'completed';
    AppState.completedTasks++;
    AppState.totalStars++;
    
    saveData();
    renderTaskList();
    updateStats();
    showStarReward();
    
    // 播放完成音效
    if (AppState.soundEnabled) {
        playSuccessSound();
    }
}

// ========================================
// 倒计时功能
// ========================================
// 存储已触发过的提醒任务ID和时间戳
let triggeredCountdowns = new Set();
let triggeredStartAlerts = new Set();

// 从本地存储加载已触发的提醒记录
function loadTriggeredAlerts() {
    const saved = localStorage.getItem('triggeredAlerts');
    if (saved) {
        const data = JSON.parse(saved);
        const today = new Date().toDateString();
        // 只加载今天的记录
        if (data.date === today) {
            triggeredCountdowns = new Set(data.countdowns || []);
            triggeredStartAlerts = new Set(data.startAlerts || []);
        } else {
            // 不是今天的记录，清空
            saveTriggeredAlerts();
        }
    }
}

// 保存已触发的提醒记录到本地存储
function saveTriggeredAlerts() {
    const data = {
        date: new Date().toDateString(),
        countdowns: Array.from(triggeredCountdowns),
        startAlerts: Array.from(triggeredStartAlerts)
    };
    localStorage.setItem('triggeredAlerts', JSON.stringify(data));
}

function checkTasksStatus() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    AppState.tasks.forEach(task => {
        if (task.status === 'completed') return;
        
        // 检查任务是否到达开始时间（闹铃提醒）
        if (task.status === 'pending' && currentTime >= task.startTime && currentTime < task.endTime) {
            const startTriggerKey = `start-${task.id}-${task.startTime}`;
            if (!triggeredStartAlerts.has(startTriggerKey)) {
                triggeredStartAlerts.add(startTriggerKey);
                saveTriggeredAlerts(); // 保存触发记录
                task.status = 'in-progress';
                renderTaskList();
                saveData();
                // 播放开始语音提醒
                if (AppState.voiceEnabled) {
                    const startMessage = task.voiceContent ? task.voiceContent.replace('该', '开始') : `宝贝，开始${task.name}啦！`;
                    speakText(startMessage, task.voice, task.name);
                }
                // 显示开始提醒弹窗
                showStartAlert(task);
            }
        }
        
        // 检查是否需要开始倒计时（结束前提醒）
        if (task.countdownEnabled && !AppState.currentCountdownTask) {
            const endTime = task.endTime;
            const countdownMinutes = task.countdownTime || 5;
            
            // 计算倒计时开始时间
            const [endHour, endMinute] = endTime.split(':').map(Number);
            const countdownStart = new Date();
            countdownStart.setHours(endHour, endMinute - countdownMinutes, 0, 0);
            const countdownStartTime = `${String(countdownStart.getHours()).padStart(2, '0')}:${String(countdownStart.getMinutes()).padStart(2, '0')}`;
            
            // 检查当前时间是否到达或超过倒计时开始时间，且任务尚未触发
            const triggerKey = `${task.id}-${countdownStartTime}`;
            if (currentTime >= countdownStartTime && currentTime < endTime && !triggeredCountdowns.has(triggerKey)) {
                triggeredCountdowns.add(triggerKey);
                saveTriggeredAlerts(); // 保存触发记录
                startCountdown(task);
            }
        }
        
        // 检查任务是否已结束但未完成
        if (currentTime > task.endTime && task.status === 'in-progress') {
            const endTriggerKey = `end-${task.id}-${task.endTime}`;
            if (!triggeredStartAlerts.has(endTriggerKey)) {
                triggeredStartAlerts.add(endTriggerKey);
                saveTriggeredAlerts();
                // 语音询问是否完成
                if (AppState.voiceEnabled) {
                    const voiceChar = VoiceCharacters[task.voice] || VoiceCharacters['princess'];
                    const endMessage = `${task.name}时间到了，你完成了吗？请说"完成了"或"还没"`;
                    speakText(endMessage, task.voice);
                    // 启动语音识别
                    startVoiceRecognition(task.id);
                }
                // 显示完成确认弹窗
                showTaskCompleteDialog(task);
            }
        }
        
        // 检查任务是否过期（未开始的任务）
        if (currentTime > task.endTime && task.status === 'pending') {
            task.status = 'in-progress';
            renderTaskList();
            saveData();
        }
    });
}

// 显示任务开始提醒弹窗
function showStartAlert(task) {
    const voiceChar = VoiceCharacters[task.voice] || VoiceCharacters['princess'];
    
    // 创建开始提醒弹窗
    const alertDiv = document.createElement('div');
    alertDiv.className = 'modal active';
    alertDiv.id = 'start-alert-modal';
    alertDiv.innerHTML = `
        <div class="modal-content voice-preview-content" style="max-width: 320px;">
            <h3 style="margin-bottom: var(--spacing-md); color: var(--text-primary);">⏰ 任务开始啦！</h3>
            <div class="voice-preview-header">
                <div class="voice-avatar-large">${task.icon}</div>
                <span class="voice-preview-name">${task.name}</span>
            </div>
            <div class="voice-preview-text">
                开始时间：${task.startTime}<br>
                结束时间：${task.endTime}
            </div>
            <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-md);">
                <button class="cancel-btn" onclick="document.getElementById('start-alert-modal').remove()" style="flex: 1;">知道了</button>
                <button class="save-btn" onclick="manualTriggerCountdown(${task.id}); document.getElementById('start-alert-modal').remove();" style="flex: 1;">
                    ⏰ 开启倒计时
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(alertDiv);
    
    // 播放音效
    if (AppState.soundEnabled) {
        playStartSound();
    }
}

// 手动触发开始提醒（用于测试）
function manualTriggerStartAlert(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (task) {
        // 更新任务状态为进行中
        task.status = 'in-progress';
        renderTaskList();
        saveData();
        
        // 播放开始语音提醒
        if (AppState.voiceEnabled) {
            const startMessage = task.voiceContent ? task.voiceContent.replace('该', '开始') : `宝贝，开始${task.name}啦！`;
            speakText(startMessage, task.voice);
        }
        
        // 显示开始提醒弹窗
        showStartAlert(task);
        showToast('开始提醒已手动触发');
    }
}

// 手动触发倒计时（用于测试）
function manualTriggerCountdown(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (task && task.countdownEnabled) {
        startCountdown(task);
        showToast('倒计时已手动触发');
    } else {
        showToast('该任务未开启倒计时提醒');
    }
}

function startCountdown(task) {
    AppState.currentCountdownTask = task;
    const countdownMinutes = task.countdownTime || 5;
    let totalSeconds = countdownMinutes * 60;
    
    // 显示倒计时页面
    showPage('countdown-page');
    
    // 更新任务名称（确保页面显示后再更新）
    const taskNameElement = document.getElementById('countdown-task-name');
    if (taskNameElement) {
        taskNameElement.textContent = `任务：${task.name}`;
    }
    
    // 播放语音提醒
    if (AppState.voiceEnabled) {
        speakText(task.voiceContent || `宝贝，${task.name}时间快到啦！`, task.voice, task.name);
    }
    
    updateCountdownDisplay(totalSeconds);
    
    AppState.countdownInterval = setInterval(() => {
        totalSeconds--;
        updateCountdownDisplay(totalSeconds);
        
        // 更新悬浮倒计时
        updateFloatingCountdown(totalSeconds);
        
        if (totalSeconds <= 0) {
            clearInterval(AppState.countdownInterval);
            showPage('home-page');
            showToast('倒计时结束！');
            AppState.currentCountdownTask = null;
        }
    }, 1000);
    
    // 显示悬浮倒计时
    document.getElementById('floating-countdown').classList.remove('hidden');
}

function updateCountdownDisplay(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    document.getElementById('countdown-minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('countdown-seconds').textContent = String(seconds).padStart(2, '0');
}

function updateFloatingCountdown(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    document.getElementById('floating-time').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function markTaskInProgress() {
    if (AppState.currentCountdownTask) {
        AppState.currentCountdownTask.status = 'in-progress';
        saveData();
        renderTaskList();
    }
    
    clearInterval(AppState.countdownInterval);
    document.getElementById('floating-countdown').classList.add('hidden');
    showPage('home-page');
    showToast('加油！马上完成任务～');
}

function minimizeCountdown() {
    clearInterval(AppState.countdownInterval);
    document.getElementById('floating-countdown').classList.add('hidden');
    showPage('home-page');
}

// ========================================
// 语音功能
// ========================================
function previewVoice() {
    const selectedVoice = document.querySelector('.voice-option.selected')?.dataset.voice || 'labixiaoxin';
    const voiceContent = document.getElementById('voice-content').value.trim();
    const taskName = document.getElementById('task-name').value.trim() || '起床';
    
    const char = VoiceCharacters[selectedVoice];
    const text = voiceContent || getDefaultVoiceContent(taskName, selectedVoice);
    
    // 更新预览弹窗
    document.getElementById('preview-avatar').textContent = char.avatar;
    document.getElementById('preview-name').textContent = char.name;
    document.getElementById('preview-text').textContent = text;
    
    showModal('voice-preview-modal');
    
    // 自动播放 - 根据任务名称播放对应的克隆音频
    setTimeout(() => {
        speakText(text, selectedVoice, taskName);
        // 更新播放按钮状态
        const playIcon = document.getElementById('play-icon');
        if (playIcon) playIcon.textContent = '⏸️';
        // 2秒后恢复按钮
        setTimeout(() => {
            if (playIcon) playIcon.textContent = '▶️';
        }, 2000);
    }, 500);
}

function toggleVoicePlay(text, voiceKey) {
    const playIcon = document.getElementById('play-icon');
    const isPlaying = playIcon.textContent === '⏸️';
    
    if (isPlaying) {
        window.speechSynthesis.cancel();
        playIcon.textContent = '▶️';
    } else {
        const previewText = text || document.getElementById('preview-text').textContent;
        const selectedVoiceKey = voiceKey || document.querySelector('.voice-option.selected')?.dataset.voice || 'princess';
        
        speakText(previewText, selectedVoiceKey);
        playIcon.textContent = '⏸️';
        
        // 播放结束后恢复按钮
        const voiceChar = VoiceCharacters[selectedVoiceKey] || VoiceCharacters['princess'];
        const duration = (previewText.length / 5) * 1000 / voiceChar.rate; // 估算播放时长
        setTimeout(() => {
            playIcon.textContent = '▶️';
        }, Math.max(duration, 1500));
    }
}

// 音频缓存
const audioCache = {};

function speakText(text, voiceKey, taskName = '') {
    if (!AppState.voiceEnabled) return;
    
    // 检查是否是自定义录音
    if (voiceKey && voiceKey.startsWith('custom_')) {
        const recordingId = voiceKey.replace('custom_', '');
        if (playCustomRecording(recordingId, 1.0)) {
            return;
        }
    }
    
    // 尝试获取对应任务的音频文件
    const audioFile = getAudioFile(voiceKey, taskName || text);
    
    if (audioFile) {
        // 播放克隆音频
        playAudioFile(audioFile, 1.0);
        return;
    }
    
    // 如果没有匹配的音频文件，使用TTS
    const voiceChar = VoiceCharacters[voiceKey] || VoiceCharacters['labixiaoxin'];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = voiceChar.rate;
    utterance.pitch = voiceChar.pitch;
    utterance.volume = voiceChar.volume;
    
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        const chineseVoices = voices.filter(v => v.lang.includes('zh'));
        if (chineseVoices.length > 0) {
            let selectedVoice = chineseVoices[0];
            if (voiceChar.pitch < 0.9) {
                selectedVoice = chineseVoices[chineseVoices.length - 1];
            } else if (voiceChar.pitch >= 0.9 && voiceChar.pitch <= 1.3) {
                selectedVoice = chineseVoices[Math.floor(chineseVoices.length / 2)];
            }
            utterance.voice = selectedVoice;
        }
    }
    
    window.speechSynthesis.speak(utterance);
}

// 播放当前选中的克隆音频（用于预览弹窗）
function playCurrentCloneVoice() {
    const selectedVoice = document.querySelector('.voice-option.selected')?.dataset.voice || 'labixiaoxin';
    playCloneVoice(selectedVoice);
}

// 播放克隆音频（保留原音质）
function playCloneVoice(voiceKey, customText) {
    const voiceChar = VoiceCharacters[voiceKey];
    if (!voiceChar || !voiceChar.audioFile) {
        showToast('未找到克隆音频文件');
        return;
    }
    
    // 更新播放按钮状态
    const playIcon = document.getElementById('play-icon');
    if (playIcon) playIcon.textContent = '⏸️';
    
    // 检查缓存
    if (!audioCache[voiceChar.audioFile]) {
        audioCache[voiceChar.audioFile] = new Audio(voiceChar.audioFile);
    }
    
    const audio = audioCache[voiceChar.audioFile];
    audio.volume = voiceChar.volume;
    audio.currentTime = 0;
    
    // 播放结束后恢复按钮
    audio.onended = () => {
        if (playIcon) playIcon.textContent = '▶️';
    };
    
    audio.play().catch(err => {
        console.log('音频播放失败:', err);
        showToast('音频文件未找到');
        if (playIcon) playIcon.textContent = '▶️';
    });
}

// 播放音频文件（通用）
function playAudioFile(audioPath, volume = 1.0) {
    // 检查缓存
    if (!audioCache[audioPath]) {
        audioCache[audioPath] = new Audio(audioPath);
    }
    
    const audio = audioCache[audioPath];
    audio.volume = volume;
    audio.currentTime = 0;
    
    // 移动端兼容性：需要用户交互后才能播放
    const playPromise = audio.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(err => {
            console.log('音频播放失败:', err);
            // 如果是自动播放策略阻止，不显示错误
            if (err.name === 'NotAllowedError') {
                console.log('需要用户交互后才能播放音频');
            } else {
                showToast('音频播放失败，请检查文件是否存在');
            }
        });
    }
}

// 移动端音频初始化（解决自动播放限制）
function initAudioForMobile() {
    // 创建空的音频上下文，用于解锁音频播放
    if (typeof AudioContext !== 'undefined') {
        const audioContext = new AudioContext();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }
    
    // 预加载所有音频文件
    Object.values(AudioFiles).forEach(voiceAudios => {
        Object.values(voiceAudios).forEach(audioPath => {
            if (!audioCache[audioPath]) {
                const audio = new Audio(audioPath);
                audio.preload = 'auto';
                audioCache[audioPath] = audio;
            }
        });
    });
    
    console.log('音频预加载完成，支持移动端播放');
}

// ========================================
// 成就系统
// ========================================
function updateStats() {
    document.getElementById('total-stars').textContent = AppState.totalStars;
    document.getElementById('streak-days').textContent = AppState.streakDays;
    document.getElementById('completed-tasks').textContent = AppState.completedTasks;
    document.getElementById('earned-stars').textContent = AppState.totalStars;
}

function updateAchievementPage() {
    document.getElementById('achievement-stars').textContent = AppState.totalStars;
    document.getElementById('achievement-streak').textContent = AppState.streakDays;
}

function showStarReward() {
    const reward = document.getElementById('star-reward');
    reward.classList.remove('hidden');
    
    // 播放音效
    if (AppState.soundEnabled) {
        playSuccessSound();
    }
    
    // 3秒后自动关闭
    setTimeout(() => {
        reward.classList.add('hidden');
    }, 3000);
}

function playSuccessSound() {
    // 使用 Web Audio API 创建简单的成功音效
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

// 播放任务开始音效（闹铃音效）
function playStartSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 创建闹铃音效（双音调）
    const playTone = (freq, start, duration) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + start);
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime + start);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + start + duration);
        
        oscillator.start(audioContext.currentTime + start);
        oscillator.stop(audioContext.currentTime + start + duration);
    };
    
    // 闹铃：叮-咚-叮-咚
    playTone(880, 0, 0.2);     // A5
    playTone(698.46, 0.3, 0.2); // F5
    playTone(880, 0.6, 0.2);     // A5
    playTone(698.46, 0.9, 0.3); // F5
}

// ========================================
// 语音识别功能
// ========================================
let recognition = null;

function initVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.continuous = false;
        recognition.interimResults = false;
    }
}

function startVoiceRecognition(taskId) {
    if (!recognition) {
        initVoiceRecognition();
    }
    
    if (!recognition) {
        console.log('浏览器不支持语音识别');
        return;
    }
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('语音识别结果:', transcript);
        
        // 判断用户说的是否是"完成了"
        if (transcript.includes('完成') || transcript.includes('好了') || transcript.includes('做完了')) {
            completeTask(taskId);
            speakText('太棒了！任务已完成，获得一颗星星！', 'princess');
        } else if (transcript.includes('还没') || transcript.includes('没有')) {
            speakText('没关系，继续加油哦！', 'princess');
        }
    };
    
    recognition.onerror = (event) => {
        console.log('语音识别错误:', event.error);
    };
    
    // 开始语音识别
    try {
        recognition.start();
        console.log('语音识别已启动');
    } catch (e) {
        console.log('语音识别启动失败:', e);
    }
}

// 显示任务完成确认弹窗
function showTaskCompleteDialog(task) {
    // 移除可能已存在的弹窗
    const existingModal = document.getElementById('task-complete-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'task-complete-modal';
    modal.innerHTML = `
        <div class="modal-content voice-preview-content" style="max-width: 340px;">
            <h3 style="margin-bottom: var(--spacing-md); color: var(--text-primary);">⏰ ${task.name}时间到了！</h3>
            <div class="voice-preview-header">
                <div class="voice-avatar-large">${task.icon}</div>
                <span class="voice-preview-name">你完成了吗？</span>
            </div>
            <div class="voice-preview-text" style="font-size: 0.9rem;">
                请说"<b>完成了</b>"或点击按钮
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--spacing-sm); margin-top: var(--spacing-md);">
                <button class="save-btn" onclick="completeTask(${task.id}); document.getElementById('task-complete-modal').remove();" style="width: 100%;">
                    ✓ 完成了
                </button>
                <button class="cancel-btn" onclick="document.getElementById('task-complete-modal').remove();" style="width: 100%;">
                    还没完成
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // 播放结束音效
    if (AppState.soundEnabled) {
        playEndSound();
    }
}

// 播放任务结束音效
function playEndSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    const playTone = (freq, start, duration) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + start);
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime + start);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + start + duration);
        
        oscillator.start(audioContext.currentTime + start);
        oscillator.stop(audioContext.currentTime + start + duration);
    };
    
    // 结束音效：咚-叮
    playTone(523.25, 0, 0.3);   // C5
    playTone(659.25, 0.4, 0.5); // E5
}

// ========================================
// 设置功能
// ========================================
function updateSettingsPage() {
    document.getElementById('voice-toggle').checked = AppState.voiceEnabled;
    document.getElementById('sound-toggle').checked = AppState.soundEnabled;
    document.getElementById('notification-toggle').checked = AppState.notificationEnabled;
}

function updateThemeUI() {
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.theme === AppState.currentTheme);
    });
}

function resetData() {
    showModal('confirm-modal');
}

function confirmReset() {
    AppState.tasks = [];
    AppState.totalStars = 0;
    AppState.streakDays = 0;
    AppState.completedTasks = 0;
    
    saveData();
    renderTaskList();
    updateStats();
    closeModal('confirm-modal');
    showToast('数据已重置');
}

function exportData() {
    const data = {
        tasks: AppState.tasks,
        totalStars: AppState.totalStars,
        streakDays: AppState.streakDays,
        completedTasks: AppState.completedTasks,
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `小习惯管家-成就记录-${new Date().toLocaleDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('成就记录已导出');
}

// ========================================
// 模态框
// ========================================
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
    
    // 重置播放按钮
    if (modalId === 'voice-preview-modal') {
        document.getElementById('play-icon').textContent = '▶️';
        window.speechSynthesis.cancel();
    }
}

// ========================================
// 事件监听
// ========================================
function initEventListeners() {
    // 图标选择
    document.querySelectorAll('.icon-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        });
    });
    
    // 语音选择
    document.querySelectorAll('.voice-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            updateSelectedVoiceDisplay();
        });
    });
    
    // 倒计时开关
    document.getElementById('enable-countdown')?.addEventListener('change', (e) => {
        document.getElementById('countdown-options').classList.toggle('hidden', !e.target.checked);
    });
    
    // 主题选择
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const theme = opt.dataset.theme;
            AppState.currentTheme = theme;
            document.documentElement.setAttribute('data-theme', theme);
            updateThemeUI();
            saveData();
        });
    });
    
    // 设置开关
    document.getElementById('voice-toggle')?.addEventListener('change', (e) => {
        AppState.voiceEnabled = e.target.checked;
        saveData();
    });
    
    document.getElementById('sound-toggle')?.addEventListener('change', (e) => {
        AppState.soundEnabled = e.target.checked;
        saveData();
    });
    
    document.getElementById('notification-toggle')?.addEventListener('change', (e) => {
        AppState.notificationEnabled = e.target.checked;
        saveData();
    });
    
    // 语音参数滑块
    document.getElementById('speed-slider')?.addEventListener('input', (e) => {
        AppState.voiceSettings.speed = parseFloat(e.target.value);
    });
    
    document.getElementById('pitch-slider')?.addEventListener('input', (e) => {
        AppState.voiceSettings.pitch = parseFloat(e.target.value);
    });
    
    // 模态框关闭
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    // 键盘事件
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
        }
    });
}

// ========================================
// 工具函数
// ========================================
function showToast(message) {
    // 创建toast元素
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        font-size: 0.95rem;
        z-index: 9999;
        animation: slideInUp 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// 确保语音列表加载
if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        // 语音列表已加载
    };
}

// ========================================
// 自定义录音功能
// ========================================

// 开始录音
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        CustomRecordings.mediaRecorder = new MediaRecorder(stream);
        CustomRecordings.audioChunks = [];
        
        CustomRecordings.mediaRecorder.ondataavailable = (event) => {
            CustomRecordings.audioChunks.push(event.data);
        };
        
        CustomRecordings.mediaRecorder.onstop = () => {
            const audioBlob = new Blob(CustomRecordings.audioChunks, { type: 'audio/webm' });
            CustomRecordings.currentRecording = audioBlob;
            
            // 停止所有音轨
            stream.getTracks().forEach(track => track.stop());
        };
        
        CustomRecordings.mediaRecorder.start();
        CustomRecordings.recordingStartTime = Date.now();
        
        // 更新UI
        document.getElementById('start-record-btn').style.display = 'none';
        document.getElementById('stop-record-btn').style.display = 'flex';
        document.getElementById('play-record-btn').style.display = 'none';
        document.getElementById('save-record-btn').style.display = 'none';
        document.getElementById('recording-status').style.display = 'block';
        document.getElementById('recording-timer').style.display = 'block';
        
        // 开始计时
        updateRecordingTimer();
        CustomRecordings.recordingTimer = setInterval(updateRecordingTimer, 1000);
        
        showToast('开始录音，请说话...');
    } catch (err) {
        console.error('录音失败:', err);
        showToast('无法访问麦克风，请检查权限设置');
    }
}

// 更新录音计时器
function updateRecordingTimer() {
    const elapsed = Math.floor((Date.now() - CustomRecordings.recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('recording-timer').textContent = 
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// 停止录音
function stopRecording() {
    if (CustomRecordings.mediaRecorder && CustomRecordings.mediaRecorder.state !== 'inactive') {
        CustomRecordings.mediaRecorder.stop();
        
        // 停止计时
        clearInterval(CustomRecordings.recordingTimer);
        
        // 更新UI
        document.getElementById('start-record-btn').style.display = 'flex';
        document.getElementById('stop-record-btn').style.display = 'none';
        document.getElementById('play-record-btn').style.display = 'flex';
        document.getElementById('save-record-btn').style.display = 'flex';
        document.getElementById('recording-status').style.display = 'none';
        
        showToast('录音完成！');
    }
}

// 播放录音
function playRecording() {
    if (CustomRecordings.currentRecording) {
        const audioUrl = URL.createObjectURL(CustomRecordings.currentRecording);
        const audio = new Audio(audioUrl);
        audio.play();
        
        // 播放按钮动画
        const playBtn = document.getElementById('play-record-btn');
        playBtn.innerHTML = '<span>⏸️</span><span>播放中</span>';
        
        audio.onended = () => {
            playBtn.innerHTML = '<span>▶️</span><span>播放</span>';
        };
    } else {
        showToast('没有可播放的录音');
    }
}

// 保存录音
async function saveRecording() {
    const promptText = document.getElementById('recording-prompt').value.trim();
    if (!promptText) {
        showToast('请输入录音提示词');
        return;
    }
    
    if (!CustomRecordings.currentRecording) {
        showToast('没有可保存的录音');
        return;
    }
    
    const duration = Math.floor((Date.now() - CustomRecordings.recordingStartTime) / 1000);
    await CustomRecordings.add(promptText, CustomRecordings.currentRecording, duration);
    
    // 清空输入
    document.getElementById('recording-prompt').value = '';
    document.getElementById('recording-timer').style.display = 'none';
    document.getElementById('play-record-btn').style.display = 'none';
    document.getElementById('save-record-btn').style.display = 'none';
    CustomRecordings.currentRecording = null;
    
    // 刷新录音列表
    renderSavedRecordings();
    
    // 刷新语音选择列表
    renderCustomVoiceOptions();
    
    showToast('录音保存成功！');
}

// 渲染已保存的录音列表
function renderSavedRecordings() {
    const container = document.getElementById('saved-recordings-list');
    const recordings = CustomRecordings.getAll();
    
    if (recordings.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 16px; font-size: 0.85rem;">暂无录音，点击上方按钮开始录制</div>';
        return;
    }
    
    container.innerHTML = recordings.map(rec => {
        const date = new Date(rec.createdAt);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        const durationStr = `${Math.floor(rec.duration / 60)}:${String(rec.duration % 60).padStart(2, '0')}`;
        
        return `
            <div class="saved-recording-item" data-recording-id="${rec.id}">
                <div class="saved-recording-icon">🎙️</div>
                <div class="saved-recording-info">
                    <span class="saved-recording-name">${rec.name}</span>
                    <span class="saved-recording-time">${dateStr} · ${durationStr}</span>
                </div>
                <div class="saved-recording-actions">
                    <button class="saved-recording-btn play" onclick="playSavedRecording(${rec.id})" title="播放">▶️</button>
                    <button class="saved-recording-btn delete" onclick="deleteSavedRecording(${rec.id})" title="删除">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// 播放已保存的录音
function playSavedRecording(id) {
    const audio = CustomRecordings.play(id);
    if (audio) {
        showToast('正在播放录音...');
    } else {
        showToast('录音播放失败');
    }
}

// 删除已保存的录音
function deleteSavedRecording(id) {
    if (!confirm('确定要删除这个录音吗？')) return;
    
    CustomRecordings.delete(id);
    renderSavedRecordings();
    renderCustomVoiceOptions();
    showToast('录音已删除');
}

// 渲染自定义录音到语音选择列表
function renderCustomVoiceOptions() {
    const voiceOptionsList = document.getElementById('voice-options-list');
    const recordings = CustomRecordings.getAll();
    
    // 移除旧的自定义录音选项
    voiceOptionsList.querySelectorAll('.voice-option.custom-recording').forEach(el => el.remove());
    
    // 添加自定义录音选项到列表开头
    recordings.forEach(rec => {
        const option = document.createElement('div');
        option.className = 'voice-option custom-recording';
        option.dataset.voice = `custom_${rec.id}`;
        option.innerHTML = `
            <div class="voice-avatar">🎙️</div>
            <div class="voice-info">
                <span class="voice-name">${rec.name}</span>
                <span class="voice-desc">自定义录音 · ${Math.floor(rec.duration / 60)}:${String(rec.duration % 60).padStart(2, '0')}</span>
            </div>
        `;
        
        option.addEventListener('click', () => {
            document.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            updateSelectedVoiceDisplay();
        });
        
        voiceOptionsList.insertBefore(option, voiceOptionsList.firstChild);
    });
}

// 播放自定义录音（用于任务提醒）
function playCustomRecording(recordingId, volume = 1.0) {
    const rec = CustomRecordings.get(parseInt(recordingId));
    if (rec) {
        const audio = new Audio(rec.audioData);
        audio.volume = volume;
        audio.play().catch(err => {
            console.log('自定义录音播放失败:', err);
        });
        return true;
    }
    return false;
}
