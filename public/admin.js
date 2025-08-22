document.addEventListener('DOMContentLoaded', () => {
    const staffListDiv = document.getElementById('staff-list');
    const shiftTypeListDiv = document.getElementById('shift-type-list');
    const applicationListDiv = document.getElementById('application-list');

    let users = [];
    let qualifications = [];
    let shiftTypes = [];
    let applications = [];
    let openShifts = [];

    // --- Data Fetching ---
    const fetchData = async () => {
        try {
            const [usersRes, qualificationsRes, shiftTypesRes, applicationsRes, openShiftsRes] = await Promise.all([
                fetch('/api/users'),
                fetch('/api/qualifications'),
                fetch('/api/shift-types'),
                fetch('/api/applications'),
                fetch('/api/open-shifts')
            ]);
            users = await usersRes.json();
            qualifications = await qualificationsRes.json();
            shiftTypes = await shiftTypesRes.json();
            applications = await applicationsRes.json();
            openShifts = await openShiftsRes.json();

            renderStaffList();
            renderShiftTypeList();
            renderApplicationList();
        } catch (error) {
            console.error('データの取得に失敗しました:', error);
        }
    };

    // --- Rendering Functions ---
    const renderStaffList = () => {
        staffListDiv.innerHTML = '';
        users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'staff-member';

            const userSkills = user.skills.map(skillId => {
                const qual = qualifications.find(q => q.id === skillId);
                return qual ? qual.name : '不明';
            }).join(', ') || 'なし';

            userDiv.innerHTML = `
                <p><strong>${user.name}</strong> (保有資格: ${userSkills})</p>
                <form data-user-id="${user.id}" class="skill-form">
                    ${qualifications.map(q => `
                        <label>
                            <input type="checkbox" value="${q.id}" ${user.skills.includes(q.id) ? 'checked' : ''}>
                            ${q.name}
                        </label>
                    `).join('')}
                    <button type="submit">資格を更新</button>
                </form>
            `;
            staffListDiv.appendChild(userDiv);
        });
    };

    const renderShiftTypeList = () => {
        shiftTypeListDiv.innerHTML = '';
        shiftTypes.forEach(st => {
            const stDiv = document.createElement('div');
            stDiv.className = 'shift-type';

            const requiredQuals = st.required_qualifications.map(req => {
                const qual = qualifications.find(q => q.id === req.qualificationId);
                return `${qual ? qual.name : '不明'} x ${req.count}`;
            }).join(', ') || 'なし';

            stDiv.innerHTML = `
                <p><strong>${st.name}</strong> (必須資格: ${requiredQuals})</p>
                <form data-shift-type-id="${st.id}" class="requirement-form">
                    <p>必須資格の編集:</p>
                    ${qualifications.map(q => {
                        const currentReq = st.required_qualifications.find(r => r.qualificationId === q.id);
                        const currentCount = currentReq ? currentReq.count : 0;
                        return `
                            <label>${q.name}:
                                <input type="number" min="0" value="${currentCount}" data-qual-id="${q.id}">
                            </label>
                        `;
                    }).join('<br>')}
                    <button type="submit">要件を更新</button>
                </form>
            `;
            shiftTypeListDiv.appendChild(stDiv);
        });
    };

    // --- Event Listeners ---
    shiftTypeListDiv.addEventListener('submit', async (e) => {
        if (e.target.classList.contains('requirement-form')) {
            e.preventDefault();
            const shiftTypeId = e.target.dataset.shiftTypeId;
            const inputs = e.target.querySelectorAll('input[type="number"]');

            const required_qualifications = Array.from(inputs)
                .map(input => ({
                    qualificationId: parseInt(input.dataset.qualId, 10),
                    count: parseInt(input.value, 10)
                }))
                .filter(req => req.count > 0);

            try {
                const res = await fetch(`/api/shift-types/${shiftTypeId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ required_qualifications })
                });

                if (res.ok) {
                    alert('要件を更新しました。');
                    fetchData(); // Re-render
                } else {
                    throw new Error('更新に失敗しました。');
                }
            } catch (error) {
                console.error('要件の更新に失敗しました:', error);
                alert('要件の更新に失敗しました。');
            }
        }
    });

    staffListDiv.addEventListener('submit', async (e) => {
        if (e.target.classList.contains('skill-form')) {
            e.preventDefault();
            const userId = e.target.dataset.userId;
            const selectedSkills = Array.from(e.target.querySelectorAll('input[type="checkbox"]:checked'))
                                       .map(input => parseInt(input.value, 10));

            try {
                const res = await fetch(`/api/users/${userId}/skills`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skills: selectedSkills })
                });
                if (res.ok) {
                    alert('資格を更新しました。');
                    fetchData(); // Re-render everything
                } else {
                    throw new Error('更新に失敗しました。');
                }
            } catch (error) {
                console.error('資格の更新に失敗しました:', error);
                alert('資格の更新に失敗しました。');
            }
        }
    });

    const validateSchedule = async (schedule) => {
        const warningsDiv = document.getElementById('compliance-warnings');
        warningsDiv.innerHTML = '';

        if (!schedule || schedule.length === 0) {
            return;
        }

        try {
            const res = await fetch('/api/schedules/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedule })
            });

            if (res.ok) {
                const { violations } = await res.json();
                if (violations.length > 0) {
                    const list = document.createElement('ul');
                    violations.forEach(v => {
                        const user = users.find(u => u.id === v.userId);
                        const userName = user ? user.name : '不明なスタッフ';
                        const listItem = document.createElement('li');
                        listItem.className = 'warning';
                        listItem.textContent = `警告: ${userName} - ${v.date} - ${v.message}`;
                        list.appendChild(listItem);
                    });
                    warningsDiv.appendChild(list);
                } else {
                    warningsDiv.innerHTML = '<p class="success">コンプライアンス違反はありません。</p>';
                }
            } else {
                throw new Error('Validation check failed');
            }
        } catch (error) {
            console.error('Failed to validate schedule:', error);
            warningsDiv.innerHTML = '<p class="error">コンプライアンスチェックに失敗しました。</p>';
        }
    };

    const renderApplicationList = () => {
        applicationListDiv.innerHTML = '';
        const pendingApps = applications.filter(a => a.status === 'pending');

        if (pendingApps.length === 0) {
            applicationListDiv.innerHTML = '<p>承認待ちの応募はありません。</p>';
            return;
        }

        const list = document.createElement('ul');
        pendingApps.forEach(app => {
            const user = users.find(u => u.id === app.userId);
            const openShift = openShifts.find(os => os.id === app.openShiftId);
            const shiftType = openShift ? shiftTypes.find(st => st.id === openShift.shiftTypeId) : null;

            if (user && openShift && shiftType) {
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    ${user.name}さんが${openShift.date}の${shiftType.name}に応募しています。
                    <button class="approve-button" data-app-id="${app.id}">承認</button>
                `;
                list.appendChild(listItem);
            }
        });
        applicationListDiv.appendChild(list);
    };

    applicationListDiv.addEventListener('click', async (e) => {
        if (e.target.classList.contains('approve-button')) {
            // ... (approval logic)
        }
    });

    // --- Schedule Generation & Display ---
    const scheduleCalendarDiv = document.getElementById('schedule-calendar');
    const generateButton = document.getElementById('generate-schedule');

    const renderSchedule = (schedule) => {
        scheduleCalendarDiv.innerHTML = '<h3>生成されたシフト</h3>';
        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>日付</th>
                    <th>スタッフ</th>
                    <th>シフト</th>
                </tr>
            </thead>
            <tbody>
            ${schedule.map(s => {
                const user = users.find(u => u.id === s.userId);
                const shiftType = shiftTypes.find(st => st.id === s.shiftTypeId);
                return `
                    <tr>
                        <td>${s.date}</td>
                        <td>${user ? user.name : '不明'}</td>
                        <td>${shiftType ? shiftType.name : '不明'}</td>
                    </tr>
                `;
            }).join('')}
            </tbody>
        `;
        scheduleCalendarDiv.appendChild(table);
        validateSchedule(schedule);
    };

    generateButton.addEventListener('click', async () => {
        const startDate = '2025-09-01'; // Hardcoded for now
        const endDate = '2025-09-30';

        generateButton.textContent = '生成中...';
        generateButton.disabled = true;

        try {
            const res = await fetch('/api/schedules/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate, endDate })
            });

            if (res.ok) {
                const newSchedule = await res.json();
                renderSchedule(newSchedule);
            } else {
                throw new Error('スケジュールの生成に失敗しました。');
            }
        } catch (error) {
            console.error(error);
            alert(error.message);
        } finally {
            generateButton.textContent = 'シフト自動生成';
            generateButton.disabled = false;
        }
    });


    // Initial fetch
    fetchData();
});
