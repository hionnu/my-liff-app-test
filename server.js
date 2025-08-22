const express = require('express');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('data/db.json');
const db = new low(adapter);

db.defaults({
  users: [],
  qualifications: [],
  shift_types: [],
  shift_requests: [],
  schedules: [],
  open_shifts: [],
  open_shift_applications: []
}).write();

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());

// --- API Endpoints ---

app.get('/api/users', (req, res) => res.json(db.get('users').value()));
app.post('/api/users', (req, res) => {
  const newUser = req.body;
  const lastUser = db.get('users').value().slice(-1)[0];
  newUser.id = lastUser ? lastUser.id + 1 : 1;
  db.get('users').push(newUser).write();
  res.status(201).json(newUser);
});

app.get('/api/qualifications', (req, res) => res.json(db.get('qualifications').value()));

app.post('/api/users/:id/skills', (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { skills } = req.body;
    const user = db.get('users').find({ id: userId });
    if (user.value()) {
        user.assign({ skills }).write();
        res.json(user.value());
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

app.get('/api/shift-types', (req, res) => res.json(db.get('shift_types').value()));
app.put('/api/shift-types/:id', (req, res) => {
    const shiftTypeId = parseInt(req.params.id, 10);
    const updatedData = req.body;
    const shiftType = db.get('shift_types').find({ id: shiftTypeId });
    if (shiftType.value()) {
        shiftType.assign(updatedData).write();
        res.json(shiftType.value());
    } else {
        res.status(404).json({ error: 'Shift type not found' });
    }
});

app.get('/api/shift-requests', (req, res) => res.json(db.get('shift_requests').value()));
app.post('/api/shift-requests', (req, res) => {
  const newRequest = req.body;
  db.get('shift_requests').push(newRequest).write();
  res.status(201).json(newRequest);
});

app.get('/api/schedules', (req, res) => res.json(db.get('schedules').value()));

// --- Compliance Validation Logic ---
const COMPLIANCE_RULES = {
    MAX_CONSECUTIVE_WORK_DAYS: 5,
    NIGHT_SHIFT_ID: 2,
};

function getViolations(schedule) {
    const violations = [];
    const shiftsByUser = schedule.reduce((acc, shift) => {
        if (!acc[shift.userId]) acc[shift.userId] = [];
        acc[shift.userId].push(shift);
        return acc;
    }, {});

    for (const userId in shiftsByUser) {
        const userShifts = shiftsByUser[userId].sort((a, b) => new Date(a.date) - new Date(b.date));
        if (userShifts.length === 0) continue;

        let consecutiveDays = 1;
        let lastWorkDate = new Date(userShifts[0].date);

        for (let i = 1; i < userShifts.length; i++) {
            const currentWorkDate = new Date(userShifts[i].date);
            const diffTime = currentWorkDate - lastWorkDate;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                consecutiveDays++;
            } else {
                consecutiveDays = 1;
            }

            if (consecutiveDays > COMPLIANCE_RULES.MAX_CONSECUTIVE_WORK_DAYS) {
                violations.push({ userId: parseInt(userId), date: userShifts[i].date, message: `連続勤務が${COMPLIANCE_RULES.MAX_CONSECUTIVE_WORK_DAYS}日を超えています。` });
            }

            if (userShifts[i-1].shiftTypeId === COMPLIANCE_RULES.NIGHT_SHIFT_ID && diffDays < 2) {
                violations.push({ userId: parseInt(userId), date: userShifts[i].date, message: '夜勤の後には、少なくとも1日の休日が必要です。' });
            }
            lastWorkDate = currentWorkDate;
        }
    }
    return violations;
}

app.post('/api/schedules/validate', (req, res) => {
    const schedule = req.body.schedule || [];
    const violations = getViolations(schedule);
    res.json({ violations });
});

// --- Help Shift Endpoints ---
app.post('/api/open-shifts', (req, res) => {
    const { date, shiftTypeId } = req.body;
    const lastOpenShift = db.get('open_shifts').value().slice(-1)[0];
    const nextId = lastOpenShift ? lastOpenShift.id + 1 : 1;
    const newOpenShift = { id: nextId, date, shiftTypeId };
    db.get('open_shifts').push(newOpenShift).write();
    res.status(201).json(newOpenShift);
});
app.get('/api/open-shifts', (req, res) => res.json(db.get('open_shifts').value()));
app.get('/api/applications', (req, res) => res.json(db.get('open_shift_applications').value()));
app.post('/api/open-shifts/:id/apply', (req, res) => {
    const openShiftId = parseInt(req.params.id, 10);
    const { userId } = req.body;
    const lastApp = db.get('open_shift_applications').value().slice(-1)[0];
    const nextId = lastApp ? lastApp.id + 1 : 1;
    const newApplication = { id: nextId, openShiftId, userId, status: 'pending' };
    db.get('open_shift_applications').push(newApplication).write();
    res.status(201).json(newApplication);
});
app.post('/api/applications/:id/approve', (req, res) => {
    const applicationId = parseInt(req.params.id, 10);
    const application = db.get('open_shift_applications').find({ id: applicationId });
    if (!application.value()) return res.status(404).json({ error: 'Application not found' });

    application.assign({ status: 'approved' }).write();
    const appDetails = application.value();
    const openShift = db.get('open_shifts').find({ id: appDetails.openShiftId }).value();

    const lastSchedule = db.get('schedules').value().slice(-1)[0];
    const nextId = lastSchedule ? lastSchedule.id + 1 : 1;
    const newScheduleEntry = { id: nextId, userId: appDetails.userId, date: openShift.date, shiftTypeId: openShift.shiftTypeId };
    db.get('schedules').push(newScheduleEntry).write();

    db.get('open_shifts').remove({ id: openShift.id }).write();
    db.get('open_shift_applications').filter({ openShiftId: openShift.id, status: 'pending' }).value()
      .forEach(app => db.get('open_shift_applications').find({ id: app.id }).assign({ status: 'rejected' }).write());
    res.json({ message: 'Application approved' });
});

// --- Schedule Generation ---
app.post('/api/schedules/generate', (req, res) => {
    const { startDate, endDate } = req.body;

    const users = db.get('users').value();
    const shiftTypes = db.get('shift_types').value();
    const requests = db.get('shift_requests').value();

    // Config: personnel needed per shift. Could be moved to shift_types in DB.
    const requiredPersonnel = { 1: 2, 2: 1 };

    db.get('schedules').remove(s => new Date(s.date) >= new Date(startDate) && new Date(s.date) <= new Date(endDate)).write();
    let schedule = [];

    for (let day = new Date(startDate); day <= new Date(endDate); day.setDate(day.getDate() + 1)) {
        const dateStr = day.toISOString().split('T')[0];
        const dayShifts = schedule.filter(s => s.date === dateStr);

        for (const shiftType of shiftTypes) {
            const neededCount = requiredPersonnel[shiftType.id] || 0;
            const assignmentsForThisShift = [];

            // Get users already working on this day
            const usersWorkingToday = dayShifts.map(s => s.userId);

            // Get users who requested this shift
            const usersRequested = requests.filter(r => r.date === dateStr && r.shiftTypeId === shiftType.id).map(r => r.userId);
            const usersWithTimeOff = requests.filter(r => r.date === dateStr && r.isOff).map(r => r.userId);

            let potentialCandidates = users.filter(u => !usersWorkingToday.includes(u.id) && !usersWithTimeOff.includes(u.id));

            // Prioritize users who requested this shift
            const requestedCandidates = potentialCandidates.filter(u => usersRequested.includes(u.id));

            for (const user of requestedCandidates) {
                if (assignmentsForThisShift.length < neededCount) {
                    const tempSchedule = [...schedule, ...assignmentsForThisShift, { date: dateStr, userId: user.id, shiftTypeId: shiftType.id }];
                    if (getViolations(tempSchedule).length === getViolations([...schedule, ...assignmentsForThisShift]).length) {
                         assignmentsForThisShift.push({ date: dateStr, userId: user.id, shiftTypeId: shiftType.id });
                         potentialCandidates = potentialCandidates.filter(c => c.id !== user.id);
                    }
                }
            }

            // Fill remaining slots based on qualifications
            const requiredQuals = shiftType.required_qualifications || [];
            let assignedInThisPhase = [];

            for (const req of requiredQuals) {
                for (let i = 0; i < req.count; i++) {
                    let qualifiedCandidates = potentialCandidates.filter(c => c.skills.includes(req.qualificationId));
                    let assigned = false;
                    while(qualifiedCandidates.length > 0) {
                        const candidateIndex = Math.floor(Math.random() * qualifiedCandidates.length);
                        const candidate = qualifiedCandidates[candidateIndex];

                        const tempSchedule = [...schedule, ...assignmentsForThisShift, { date: dateStr, userId: candidate.id, shiftTypeId: shiftType.id }];
                        if (getViolations(tempSchedule).length === getViolations([...schedule, ...assignmentsForThisShift]).length) {
                            assignmentsForThisShift.push({ date: dateStr, userId: candidate.id, shiftTypeId: shiftType.id });
                            potentialCandidates = potentialCandidates.filter(p => p.id !== candidate.id);
                            assigned = true;
                            break; // Exit while loop once assigned
                        }
                        qualifiedCandidates.splice(candidateIndex, 1);
                    }
                    if (!assigned) {
                        console.log(`Warning: Could not find qualified candidate for skill ${req.qualificationId} on ${dateStr}`);
                    }
                }
            }

            // Fill any remaining general slots
            while (assignmentsForThisShift.length < neededCount) {
                if (potentialCandidates.length === 0) break;
                const candidateIndex = Math.floor(Math.random() * potentialCandidates.length);
                const candidate = potentialCandidates[candidateIndex];
                const tempSchedule = [...schedule, ...assignmentsForThisShift, { date: dateStr, userId: candidate.id, shiftTypeId: shiftType.id }];
                if (getViolations(tempSchedule).length === getViolations([...schedule, ...assignmentsForThisShift]).length) {
                    assignmentsForThisShift.push({ date: dateStr, userId: candidate.id, shiftTypeId: shiftType.id });
                }
                potentialCandidates.splice(candidateIndex, 1);
            }
            schedule.push(...assignmentsForThisShift);
        }
    }
    db.set('schedules', schedule).write();
    res.json(db.get('schedules').value());
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
