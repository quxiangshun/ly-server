<template>
  <el-config-provider size="small">
  <div class="app">
    <el-container>
      <el-header class="header">
        <div class="toolbar">
          <el-tag :type="running ? 'success' : 'info'" effect="dark" size="small">
            {{ running ? '运行中' : '已停止' }}
          </el-tag>
          <el-button type="primary" :loading="loadingStart" :disabled="running" @click="handleStart">
            启动
          </el-button>
          <el-button type="danger" :loading="loadingStop" :disabled="!running" @click="handleStop">
            停止
          </el-button>
          <el-button type="warning" :loading="loadingRestart" @click="handleRestart">
            重启
          </el-button>
        </div>
      </el-header>
      <el-main class="main">
        <div class="main-left">
          <el-card class="config-card" shadow="hover">
            <template #header>
              <div class="card-actions">
                <el-button type="primary" size="small" :loading="loadingLoad" @click="loadConfig">
                  重新加载
                </el-button>
                <el-button type="success" size="small" :loading="loadingSave" @click="saveConfig">
                  保存并覆盖
                </el-button>
              </div>
            </template>
            <el-form label-width="80px" class="config-form">
              <el-row :gutter="16">
                <el-col :xs="24" :sm="24" :md="8" :lg="6" :xl="5">
                  <el-form-item label="端口">
                    <el-input-number v-model="port" :min="1" :max="65535" :controls="true" controls-position="right" class="port-input" style="width: 100%" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :sm="24" :md="16" :lg="18" :xl="19">
                  <el-form-item label="根目录">
                    <div class="root-path-wrap">
                      <el-input
                        v-model="rootPath"
                        placeholder="输入或选择本地路径，如 . 或 D:/www"
                        class="root-path-input"
                        clearable
                      />
                      <el-button type="primary" native-type="button" @click.prevent="browsePath">浏览</el-button>
                    </div>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row>
                <el-col :span="24">
                  <el-form-item label="上传文件">
                    <el-upload
                      ref="uploadRef"
                      drag
                      :auto-upload="false"
                      :show-file-list="false"
                      multiple
                      :limit="50"
                      :disabled="!rootPath || uploading"
                      :on-change="onFileChange"
                      :on-exceed="onExceed"
                    >
                      <div class="upload-drag-content">
                        <div class="upload-icon">📁</div>
                        <div class="upload-text">将文件拖到此处，或<em>点击上传</em></div>
                        <div class="upload-tip">选择后直接上传到根目录</div>
                      </div>
                    </el-upload>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </el-card>
          <el-card class="log-card" shadow="hover">
            <template #header>
              <span>运行日志</span>
              <el-button type="info" size="small" text @click="logLines = []">清空</el-button>
            </template>
            <div class="log-output" ref="logRef">{{ logLines.join('') || '（暂无输出）' }}</div>
          </el-card>
        </div>
        <aside class="file-list-panel">
          <div class="file-list-panel-header">
            <span>根目录文件列表</span>
            <el-button type="info" size="small" text :disabled="!rootPath" @click="refreshFileList">
              刷新
            </el-button>
          </div>
          <div class="file-list-panel-body" v-loading="listLoading">
            <el-table
              v-if="rootPath"
              :data="folderFiles"
              stripe
              class="file-list-table"
              empty-text="暂无文件"
            >
              <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip>
                <template #default="{ row }">
                  <span :class="{ 'is-dir': row.isDir }">{{ row.name }}{{ row.isDir ? '/' : '' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="isDir" label="类型" width="56">
                <template #default="{ row }">{{ row.isDir ? '目录' : '文件' }}</template>
              </el-table-column>
              <el-table-column prop="size" label="大小" width="72">
                <template #default="{ row }">{{ row.isDir ? '—' : formatSize(row.size) }}</template>
              </el-table-column>
            </el-table>
            <div v-else class="file-list-empty">请先选择根目录</div>
          </div>
        </aside>
      </el-main>
    </el-container>
  </div>
  </el-config-provider>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';

const api = typeof window !== 'undefined' && window.caddyAPI;

const rootPath = ref('');
const port = ref(80);
const running = ref(false);
const loadingStart = ref(false);
const loadingStop = ref(false);
const loadingRestart = ref(false);
const loadingLoad = ref(false);
const loadingSave = ref(false);
const logLines = ref([]);
const logRef = ref(null);
const pendingFiles = ref([]);
const uploadRef = ref(null);
const uploading = ref(false);
const folderFiles = ref([]);
const listLoading = ref(false);

function addLog(line, isErr = false) {
  logLines.value.push(line);
  nextTick(() => {
    if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight;
  });
}

async function loadConfig() {
  if (!api) {
    ElMessage.warning('仅支持在 Electron 中运行');
    return;
  }
  loadingLoad.value = true;
  try {
    const res = await api.readConfig();
    if (res.ok) {
      rootPath.value = res.rootPath ?? '';
      port.value = res.port ?? 80;
      ElMessage.success('配置已加载');
    } else {
      ElMessage.error(res.error || '加载失败');
    }
  } finally {
    loadingLoad.value = false;
  }
}

async function saveConfig() {
  if (!api) {
    ElMessage.warning('仅支持在 Electron 中运行');
    return;
  }
  loadingSave.value = true;
  try {
    const res = await api.writeConfig(rootPath.value, port.value);
    if (res.ok) {
      ElMessage.success('配置已保存');
    } else {
      ElMessage.error(res.error || '保存失败');
    }
  } finally {
    loadingSave.value = false;
  }
}

async function refreshStatus() {
  if (!api) return;
  const res = await api.status();
  running.value = res?.running ?? false;
}

async function handleStart() {
  if (!api) {
    ElMessage.warning('仅支持在 Electron 中运行');
    return;
  }
  loadingStart.value = true;
  try {
    const res = await api.start();
    if (res.ok) {
      running.value = true;
      ElMessage.success('服务已启动');
    } else {
      ElMessage.error(res.error || '启动失败');
    }
  } finally {
    loadingStart.value = false;
  }
}

async function handleStop() {
  if (!api) {
    ElMessage.warning('仅支持在 Electron 中运行');
    return;
  }
  loadingStop.value = true;
  try {
    const res = await api.stop();
    if (res.ok) {
      running.value = false;
      ElMessage.success('服务已停止');
    } else {
      ElMessage.error(res.error || '停止失败');
    }
  } finally {
    loadingStop.value = false;
  }
}

async function handleRestart() {
  if (!api) {
    ElMessage.warning('仅支持在 Electron 中运行');
    return;
  }
  loadingRestart.value = true;
  try {
    const res = await api.restart();
    if (res.ok) {
      running.value = true;
      ElMessage.success('服务已重启');
    } else {
      ElMessage.error(res.error || '重启失败');
    }
  } finally {
    loadingRestart.value = false;
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function refreshFileList() {
  if (!api || !rootPath.value) return;
  listLoading.value = true;
  try {
    const res = await api.listFiles(rootPath.value);
    if (res?.ok) {
      folderFiles.value = res.files ?? [];
    } else {
      folderFiles.value = [];
    }
  } finally {
    listLoading.value = false;
  }
}

let uploadTimer = null;
function onFileChange(file, fileList) {
  pendingFiles.value = fileList.map((f) => f.raw).filter(Boolean);
  if (!rootPath.value || pendingFiles.value.length === 0) return;
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => doUpload(), 100);
}

function onExceed() {
  ElMessage.warning('最多选择 50 个文件');
}

async function doUpload() {
  if (!api || !rootPath.value || pendingFiles.value.length === 0) return;
  const toUpload = [...pendingFiles.value];
  pendingFiles.value = [];
  if (uploadRef.value) uploadRef.value.clearFiles();
  uploading.value = true;
  try {
    const filesWithData = await Promise.all(
      toUpload.map(async (file) => {
        const data = await file.arrayBuffer();
        return { name: file.name, data };
      })
    );
    const res = await api.writeFiles(rootPath.value, filesWithData);
    if (res?.ok) {
      ElMessage.success(`成功上传 ${res.count} 个文件`);
      await refreshFileList();
    } else {
      ElMessage.error(res?.error || '上传失败');
    }
  } catch (e) {
    ElMessage.error(e?.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

function setupListeners() {
  if (!api) return;
  api.onStdout((data) => addLog(data));
  api.onStderr((data) => addLog(data, true));
  api.onExit(({ code, signal }) => {
    running.value = false;
    addLog(`\n[进程退出] code=${code} signal=${signal}\n`);
  });
  api.onError((msg) => {
    addLog(`[错误] ${msg}\n`, true);
  });
}

async function browsePath() {
  if (!api) {
    ElMessage.warning('仅支持在 Electron 中运行，请用 npm run electron:dev 启动');
    return;
  }
  try {
    const res = await api.selectDirectory();
    if (res.ok && res.path) {
      rootPath.value = res.path;
      await refreshFileList();
    }
  } catch (e) {
    ElMessage.error('打开目录选择失败：' + (e?.message || String(e)));
  }
}

onMounted(async () => {
  setupListeners();
  await loadConfig();
  await refreshStatus();
});

onUnmounted(() => {});
</script>

<style>
* {
  box-sizing: border-box;
}
html, body, #app {
  margin: 0;
  height: 100%;
}
.app {
  height: 100%;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  color: #e8e8e8;
}
.el-container {
  height: 100%;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: #fff;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.main {
  flex: 1;
  min-height: 0;
  padding: 12px;
  display: flex;
  flex-direction: row;
  gap: 12px;
}
.main-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.main-left .config-card {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.main-left .log-card {
  flex-shrink: 0;
}
.file-list-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}
.file-list-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #e8e8e8;
  font-size: 12px;
}
.file-list-panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 6px;
}
.file-list-empty {
  padding: 16px;
  text-align: center;
  color: #b0b0b0;
  font-size: 11px;
}
.config-card,
.log-card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.config-card .el-card__header,
.log-card .el-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #e8e8e8;
}
.card-actions {
  display: flex;
  gap: 8px;
  width: 100%;
  justify-content: flex-end;
}
.config-form .el-form-item__label {
  color: #b0b0b0;
}
.config-form .el-form-item__content {
  flex: 1;
  min-width: 0;
}
.config-form .port-input,
.config-form .el-input-number {
  width: 100%;
}
.config-form .el-upload {
  width: 100%;
}
.port-input .el-input__wrapper,
.config-form .el-input-number .el-input__wrapper {
  background: rgba(0, 0, 0, 0.25);
  color: #e8e8e8;
}
.root-path-wrap {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
}
.root-path-wrap .root-path-input {
  flex: 1;
  min-width: 0;
}
.root-path-input input,
.config-form .el-input__wrapper {
  background: rgba(0, 0, 0, 0.25);
  color: #e8e8e8;
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.root-path-input input:focus {
  border-color: #409eff;
  background: rgba(0, 0, 0, 0.3);
}
.config-form .el-form-item {
  margin-bottom: 14px;
}
.config-form .el-upload-dragger {
  width: 100%;
  margin: 0;
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.15);
  padding: 12px;
}
.config-form .el-upload-dragger:hover {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.1);
}
.upload-drag-content {
  text-align: center;
}
.upload-icon {
  font-size: 28px;
  margin-bottom: 4px;
}
.upload-text {
  color: #c0c0c0;
  font-size: 12px;
}
.upload-text em {
  color: #409eff;
  font-style: normal;
  font-weight: 500;
}
.upload-tip {
  color: #808080;
  font-size: 11px;
  margin-top: 2px;
}
.file-list-table {
  background: transparent !important;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
}
.file-list-table .el-table__header th {
  background: rgba(0, 0, 0, 0.55) !important;
  color: #f0f0f0;
  font-size: 11px;
  font-weight: 600;
}
.file-list-table .el-table__row td {
  background: rgba(0, 0, 0, 0.45) !important;
  color: #e8e8e8;
  font-size: 11px;
}
.file-list-table .el-table__row.el-table__row--striped td {
  background: rgba(0, 0, 0, 0.5) !important;
  color: #e8e8e8;
}
.file-list-table .is-dir {
  color: #67c23a;
}
.log-card {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  max-height: 220px;
}
.log-card .el-card__body {
  flex: 1;
  min-height: 0;
  padding: 8px;
}
.log-output {
  height: 140px;
  overflow-y: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: #b0b0b0;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 6px;
  padding: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}
.el-button {
  font-weight: 500;
}
</style>
