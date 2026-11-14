// Progressive enhancement for the index: filter, sort, grid/list view and hover prefetch.
// The page is complete without this script.
(() => {
    const root = document.documentElement;
    const list = document.getElementById('index');
    const controls = document.getElementById('controls');
    const count = document.getElementById('count');
    if (!list || !controls) return;

    const items = [...list.querySelectorAll('.exp[data-id]')];
    const slot = list.querySelector('.exp-next');
    const state = { filter: 'all', sort: 'curated', view: root.dataset.view || 'grid' };

    const remember = (value) => {
        try {
            localStorage.setItem('lab-view', value);
        } catch (error) { /* storage can be blocked */ }
    };

    const sorters = {
        curated: (a, b) => a.dataset.order - b.dataset.order,
        newest: (a, b) => b.dataset.date.localeCompare(a.dataset.date) || a.dataset.order - b.dataset.order,
        lightest: (a, b) => a.dataset.weight - b.dataset.weight || a.dataset.order - b.dataset.order,
    };

    function render() {
        const ordered = [...items].sort(sorters[state.sort]);
        ordered.forEach((el, index) => { el.style.order = index; });

        let shown = 0;
        for (const el of items) {
            const visible = state.filter === 'all' || el.dataset.media.split(' ').includes(state.filter);
            el.hidden = !visible;
            if (visible) shown++;
        }

        if (slot) slot.hidden = state.filter !== 'all';
        list.dataset.featured = state.sort === 'curated' && state.filter === 'all' ? 'on' : 'off';
        root.dataset.view = state.view;

        for (const button of controls.querySelectorAll('button')) {
            const { filter, sort, view } = button.dataset;
            const active = (filter && filter === state.filter) || (sort && sort === state.sort) || (view && view === state.view);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        }

        if (count) count.textContent = `Showing ${shown} of ${items.length}`;
    }

    controls.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.filter) state.filter = button.dataset.filter;
        if (button.dataset.sort) state.sort = button.dataset.sort;
        if (button.dataset.view) {
            state.view = button.dataset.view;
            remember(state.view);
        }
        render();
    });

    controls.hidden = false;
    render();

    // Warm the next page on intent (hover or keyboard focus), unless the visitor asked to save data.
    const prefetched = new Set();
    const saveData = navigator.connection && navigator.connection.saveData;
    const prefetch = (event) => {
        const link = event.target.closest && event.target.closest('a.exp-link');
        if (!link || saveData || prefetched.has(link.href)) return;
        prefetched.add(link.href);
        const tag = document.createElement('link');
        tag.rel = 'prefetch';
        tag.href = link.href;
        document.head.appendChild(tag);
    };
    list.addEventListener('pointerover', prefetch);
    list.addEventListener('focusin', prefetch);
})();
