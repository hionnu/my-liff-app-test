document.addEventListener('DOMContentLoaded', () => {
    const LOGGED_IN_USER_ID = 2; // Hardcoded for now: 佐藤 太郎さん

    // --- DOM Elements ---
    const openShiftsListDiv = document.getElementById('open-shifts-list');
    const requestCalendarDiv = document.getElementById('request-calendar');
    const modal = document.getElementById('request-modal');
    const modalDate = document.getElementById('modal-date');
    const requestForm = document.getElementById('request-form');
    const closeModal = document.querySelector('.close-button');

    // --- State ---
    let openShifts = [];
    let shiftTypes = [];
    let shiftRequests = [];
    let selectedDate = null;

    // --- Data Fetching ---
    const fetchData = async () => {
        try {
            const [openShiftsRes, shiftTypesRes, requestsRes] = await Promise.all([
                fetch('/api/open-shifts'),
                fetch('/api/shift-types'),
                fetch('/api/shift-requests')
            ]);
            openShifts = await openShiftsRes.json();
            shiftTypes = await shiftTypesRes.json();
            shiftRequests = await requestsRes.json();

            renderOpenShifts();
            renderRequestCalendar(2025, 8); // Render September (0-indexed month)
        } catch (error) {
            console.error('データの取得に失敗しました:', error);
        }
    };

    // --- Rendering ---
    const renderOpenShifts = () => {
        // ... (existing code from previous step)
    };

    const renderRequestCalendar = (year, month) => {
        requestCalendarDiv.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'calendar-grid';

        const days = ['日', '月', '火', '水', '木', '金', '土'];
        days.forEach(day => {
            const header = document.createElement('div');
            header.className = 'calendar-header';
            header.textContent = day;
            grid.appendChild(header);
        });

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        for (let i = 0; i < firstDay.getDay(); i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day other-month';
            grid.appendChild(emptyCell);
        }

        for (let i = 1; i <= lastDay.getDate(); i++) {
            const dayCell = document.createElement('div');
            const date = new Date(year, month, i);
            const dateStr = date.toISOString().split('T')[0];
            dayCell.className = 'calendar-day';
            dayCell.dataset.date = dateStr;

            const dayNumber = document.createElement('div');
            dayNumber.className = 'day-number';
            dayNumber.textContent = i;
            dayCell.appendChild(dayNumber);

            const userRequest = shiftRequests.find(r => r.userId === LOGGED_IN_USER_ID && r.date === dateStr);
            if (userRequest) {
                const reqDiv = document.createElement('div');
                reqDiv.className = 'day-request';
                if (userRequest.isOff) {
                    reqDiv.textContent = '休み希望';
                    reqDiv.classList.add('off');
                } else {
                    const st = shiftTypes.find(s => s.id === userRequest.shiftTypeId);
                    reqDiv.textContent = st ? `${st.name}希望` : '希望あり';
                }
                dayCell.appendChild(reqDiv);
            }

            grid.appendChild(dayCell);
        }
        requestCalendarDiv.appendChild(grid);
    };

    // --- Modal Logic ---
    const openModal = (date) => {
        selectedDate = date;
        modalDate.textContent = date;

        let formContent = shiftTypes.map(st => `
            <label>
                <input type="radio" name="request-type" value="shift-${st.id}" required>
                ${st.name}
            </label>
        `).join('<br>');
        formContent += `<br><label><input type="radio" name="request-type" value="off">休み</label>`;

        // Clear previous content and add new
        while (requestForm.firstChild && requestForm.firstChild.tagName !== 'BUTTON') {
            requestForm.removeChild(requestForm.firstChild);
        }
        requestForm.insertAdjacentHTML('afterbegin', formContent);

        modal.style.display = 'block';
    };

    const hideModal = () => {
        modal.style.display = 'none';
        selectedDate = null;
    };

    // --- Event Listeners ---
    requestCalendarDiv.addEventListener('click', (e) => {
        const dayCell = e.target.closest('.calendar-day');
        if (dayCell && dayCell.dataset.date) {
            openModal(dayCell.dataset.date);
        }
    });

    closeModal.addEventListener('click', hideModal);
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideModal();
        }
    });

    requestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selection = new FormData(e.target).get('request-type');
        if (!selection) return;

        const isOff = selection === 'off';
        const shiftTypeId = isOff ? null : parseInt(selection.split('-')[1], 10);

        try {
            const res = await fetch('/api/shift-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: LOGGED_IN_USER_ID,
                    date: selectedDate,
                    shiftTypeId: shiftTypeId,
                    isOff: isOff
                })
            });
            if (res.ok) {
                alert('希望を提出しました。');
                hideModal();
                fetchData(); // Refresh calendar
            } else {
                throw new Error('希望の提出に失敗しました。');
            }
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
    });

    // (Existing event listener for open shifts list)
    openShiftsListDiv.addEventListener('click', async (e) => {
        if (e.target.classList.contains('apply-button')) {
            // ... (existing code)
        }
    });

    // --- Initial Load ---
    fetchData();
});
