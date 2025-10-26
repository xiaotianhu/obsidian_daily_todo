const { Plugin, MarkdownRenderChild } = require('obsidian');

class WeeklyTodoCardsPlugin extends Plugin {
    async onload() {
        console.log('Loading Weekly Todo Cards plugin');

        this.registerMarkdownCodeBlockProcessor('weeklyTodo', (source, el, ctx) => {
            const renderChild = new WeeklyTodoRenderer(el, source, ctx, this.app);
            ctx.addChild(renderChild);
        });
    }

    onunload() {
        console.log('Unloading Weekly Todo Cards plugin');
    }
}

class WeeklyTodoRenderer extends MarkdownRenderChild {
    constructor(containerEl, source, ctx, app) {
        super(containerEl);
        this.source = source;
        this.ctx = ctx;
        this.app = app;
        this.file = this.app.workspace.getActiveFile();
    }

    async onload() {
        await this.render();
    }

    async render() {
        const COLS = 3;
        const WEEK_START = 0;

        // 解析 weeklyTodo 数据
        const todos = {};
        let cur = "";
        this.source.split("\n").forEach(l => {
            const d = l.match(/\[(\d{4}-\d{2}-\d{2})\]/);
            if (d) { cur = d[1]; return; }
            const m = l.match(/^(\s*)- \[([ x])\] (.+)/);
            if (m && cur) {
                if (!todos[cur]) todos[cur] = [];
                todos[cur].push({ text: m[3], done: m[2] === "x" });
            }
        });

        // 生成连续 N 天
        const today = window.moment();
        const start = today.clone().startOf("week").add(WEEK_START, "d");
        const days = Array.from({ length: COLS }, (_, i) => start.clone().add(i, "d"));

        // 生成卡片 HTML
        const colors = ['#FFE4B5', '#FFD4B5', '#FFE5CC', '#FFF4E0', '#FFEFD5', '#FFE4C4', '#FFDAB9'];

        const cards = days.map((date, index) => {
            const key = date.format("YYYY-MM-DD");
            const list = todos[key] || [];
            const total = list.length;
            const done = list.filter(t => t.done).length;
            const headerColor = colors[index % colors.length];

            const tasksHtml = list.map(t => `
                <div class="wtc-task-row ${t.done ? "wtc-done" : "wtc-pending"}">
                    <input type="checkbox"
                           class="wtc-checkbox"
                           ${t.done ? "checked" : ""}
                           data-date="${key}"
                           data-text="${t.text.replace(/"/g, '&quot;')}">
                    <div class="wtc-txt">${t.text}</div>
                </div>
            `).join("");

            return `
                <div class="wtc-card">
                    <div class="wtc-header" style="background-color: ${headerColor}">
                        <span class="wtc-date">${date.format("ddd MM/DD")}</span>
                        <span class="wtc-badge">${done}/${total}</span>
                    </div>
                    <div class="wtc-body">${tasksHtml || "<div class='wtc-empty'>No tasks</div>"}</div>
                </div>
            `;
        }).join("");

        this.containerEl.innerHTML = `<div class="wtc-board">${cards}</div>`;

        // 绑定复选框事件
        this.containerEl.querySelectorAll('.wtc-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                await this.updateTodo(
                    e.target.dataset.date,
                    e.target.dataset.text,
                    e.target.checked
                );
            });
        });
    }

    async updateTodo(date, text, checked) {
        const file = this.app.workspace.getActiveFile();
        if (!file) return;

        const content = await this.app.vault.read(file);
        const esc = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`(\\[${date}\\][\\s\\S]*?^\\s*- \\[)([ x])(\\] ${esc})`, "gm");
        const newContent = content.replace(re, (m, g1, g2, g3) => g1 + (checked ? "x" : " ") + g3);

        await this.app.vault.modify(file, newContent);
    }
}

module.exports = WeeklyTodoCardsPlugin;
