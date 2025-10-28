const { Plugin, MarkdownRenderChild, PluginSettingTab, Setting } = require('obsidian');

// 默认设置
const DEFAULT_SETTINGS = {
    cardWidth: 280,
    cardGap: 16
};

class ColumnTodoCardsPlugin extends Plugin {
    async onload() {
        console.log('Loading Column Todo Cards plugin');

        // 加载设置
        await this.loadSettings();

        // 添加设置页面
        this.addSettingTab(new ColumnTodoCardsSettingTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor('columnTodo', (source, el, ctx) => {
            // 传递插件实例，让渲染器能获取最新的设置
            const renderChild = new ColumnTodoRenderer(el, source, ctx, this.app, this);
            ctx.addChild(renderChild);
        });
    }

    onunload() {
        console.log('Unloading Column Todo Cards plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        console.log('Settings saved:', this.settings);
    }
}

class ColumnTodoRenderer extends MarkdownRenderChild {
    constructor(containerEl, source, ctx, app, plugin) {
        super(containerEl);
        this.source = source;
        this.ctx = ctx;
        this.app = app;
        this.plugin = plugin;
        this.file = this.app.workspace.getActiveFile();
    }

    async onload() {
        await this.render();
    }

    async render() {

        // 解析 columnTodo 数据
        const todos = {};
        let cur = "";
        this.source.split("\n").forEach(l => {
            // 匹配标题行：以 [内容] 开头，后面没有其他内容的行
            const d = l.match(/^\[([^\]]+)\]\s*$/);
            if (d) { 
                cur = d[1]; 
                return; 
            }
            const m = l.match(/^(\s*)- \[([ x])\] (.+)/);
            if (m && cur) {
                if (!todos[cur]) todos[cur] = [];
                todos[cur].push({ text: m[3], done: m[2] === "x" });
            }
        });

        // 获取所有标题并保持原始顺序
        const allTitles = Object.keys(todos);

        // 如果没有数据，显示提示
        if (allTitles.length === 0) {
            this.containerEl.innerHTML = '<div class="wtc-empty">No tasks found</div>';
            return;
        }

        // 生成卡片 HTML
        const colors = ['#FFE4B5', '#FFD4B5', '#FFE5CC', '#FFF4E0', '#FFEFD5', '#FFE4C4', '#FFDAB9'];

        const cards = allTitles.map((title, index) => {
            const key = title;
            const list = todos[key] || [];
            const total = list.length;
            const done = list.filter(t => t.done).length;
            const headerColor = colors[index % colors.length];

            const tasksHtml = list.map(t => `
                <div class="wtc-task-row ${t.done ? "wtc-done" : "wtc-pending"}">
                    <input type="checkbox"
                           class="wtc-checkbox"
                           ${t.done ? "checked" : ""}
                           data-title="${key}"
                           data-text="${t.text.replace(/"/g, '&quot;')}">
                    <div class="wtc-txt">${t.text}</div>
                </div>
            `).join("");

            // 判断是否为日期格式
            const isDate = /^\d{4}-\d{2}-\d{2}$/.test(title);
            let headerText;
            if (isDate) {
                const date = window.moment(title);
                headerText = date.format("ddd MM/DD");
            } else {
                headerText = title;
            }

            return `
                <div class="wtc-card">
                    <div class="wtc-header" style="background-color: ${headerColor}">
                        <span class="wtc-date">${headerText}</span>
                        <span class="wtc-badge">${done}/${total}</span>
                    </div>
                    <div class="wtc-body">${tasksHtml || "<div class='wtc-empty'>No tasks</div>"}</div>
                </div>
            `;
        });

        // 所有卡片放在一个board中，利用flex-wrap自动换行
        // 从插件实例获取最新的设置，使用!important确保优先级
        const settings = this.plugin.settings;
        const boardStyle = `gap: ${settings.cardGap}px !important;`;
        const cardStyle = `width: ${settings.cardWidth}px !important; min-width: ${settings.cardWidth}px !important; max-width: ${settings.cardWidth}px !important;`;

        console.log('Rendering with settings:', settings);

        this.containerEl.innerHTML = `
            <style>
                .wtc-board { ${boardStyle} }
                .wtc-card { ${cardStyle} }
            </style>
            <div class="wtc-container"><div class="wtc-board">${cards.join("")}</div></div>
        `;

        // 绑定复选框事件
        this.containerEl.querySelectorAll('.wtc-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                await this.updateTodo(
                    e.target.dataset.title,
                    e.target.dataset.text,
                    e.target.checked
                );
            });
        });
    }

    async updateTodo(title, text, checked) {
        const file = this.app.workspace.getActiveFile();
        if (!file) return;

        const content = await this.app.vault.read(file);
        const esc = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // 转义标题中的特殊字符
        const escTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(\\[${escTitle}\\][\\s\\S]*?^\\s*- \\[)([ x])(\\] ${esc})`, "gm");
        const newContent = content.replace(re, (m, g1, g2, g3) => g1 + (checked ? "x" : " ") + g3);

        await this.app.vault.modify(file, newContent);
    }
}

// 设置页面
class ColumnTodoCardsSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        // 每次打开设置页面时，重新从插件获取最新设置
        this.tempSettings = { ...this.plugin.settings };

        containerEl.createEl('h2', { text: 'Column Todo Cards Settings' });

        // 显示当前设置
        containerEl.createEl('p', {
            text: `Current settings: Width=${this.tempSettings.cardWidth}px, Gap=${this.tempSettings.cardGap}px`,
            cls: 'setting-item-description'
        });

        let widthInput, gapInput;

        // 卡片宽度设置
        new Setting(containerEl)
            .setName('Card Width')
            .setDesc('Width of each card in pixels (200-500, recommended: 250-350)')
            .addText(text => {
                widthInput = text;
                text
                    .setPlaceholder('280')
                    .setValue(String(this.tempSettings.cardWidth))
                    .onChange((value) => {
                        this.tempSettings.cardWidth = parseInt(value) || this.tempSettings.cardWidth;
                    });
            });

        // 卡片间距设置
        new Setting(containerEl)
            .setName('Card Gap')
            .setDesc('Gap between cards in pixels (0-50, recommended: 8-24)')
            .addText(text => {
                gapInput = text;
                text
                    .setPlaceholder('16')
                    .setValue(String(this.tempSettings.cardGap))
                    .onChange((value) => {
                        this.tempSettings.cardGap = parseInt(value) || this.tempSettings.cardGap;
                    });
            });

        // 保存按钮
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('Save Settings')
                .setCta()
                .onClick(async () => {
                    // 验证并保存
                    const width = this.tempSettings.cardWidth;
                    const gap = this.tempSettings.cardGap;

                    if (width < 200 || width > 500) {
                        alert('Card width must be between 200 and 500');
                        return;
                    }
                    if (gap < 0 || gap > 50) {
                        alert('Card gap must be between 0 and 50');
                        return;
                    }

                    this.plugin.settings.cardWidth = width;
                    this.plugin.settings.cardGap = gap;
                    await this.plugin.saveSettings();

                    button.setButtonText('Saved!');
                    setTimeout(() => {
                        button.setButtonText('Save Settings');
                        // 重新显示页面以更新当前设置信息
                        this.display();
                    }, 1500);
                }));

        // 添加说明
        containerEl.createEl('p', {
            text: 'Note: After saving, close and reopen your note to see the changes.',
            cls: 'setting-item-description'
        });
    }
}

module.exports = ColumnTodoCardsPlugin;
