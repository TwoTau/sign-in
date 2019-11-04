const { DateTime } = require('luxon');
const functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp();

async function getMemberData(name) {
	return (await admin.database().ref(`members/${name}`).once("value")).val();
}

async function getNextKey(name, date, startOrEnd) {
	const currData = (await admin.database().ref(`log/${name}/meetings/${date}`).once("value")).val();
	let keyNum = 0;
	while(currData && currData[startOrEnd + keyNum]) {
		++keyNum;
	}
	return startOrEnd + keyNum;
}

exports.signin = functions.https.onRequest(async (req, res) => {
	let { name, type } = req.query;
	if (!name || !type) {
		return res.status(400).send('No name or type specified');
	}

	type = type.toLowerCase();
	if (type !== 'in' && type !== 'out') {
		return res.status(400).send('Invalid type. Valid \'type\' params are \'in\' and \'out\'');
	}

	const memberData = await getMemberData(name);
	if (!memberData) { // memberData is null iff name is not a key in members
		return res.status(400).send('Nonexistent member');
	} else if ((type === 'in') === memberData.present) { // invalid state
		return res.status(400).send('Cannot sign out an already nonpresent member or sign in an already present user.');
	}

	const now = DateTime.local().setZone('America/Los_Angeles');
	const date = now.toISODate();
	const time = now.toLocaleString(DateTime.TIME_24_WITH_SECONDS);

	const key = await getNextKey(name, date, (type === 'in' ? "start" : "end"));

	const updates = {};
	updates[`log/${name}/meetings/${date}/${key}`] = time;
	updates[`members/${name}/present`] = (type === 'in');
	admin.database().ref().update(updates);

	return res.send(`${date}T${time}`);
});

exports.getlog = functions.https.onRequest(async (req, res) => {
	const { name } = req.query;
	if (!name) {
		return res.status(400).send('No name specified');
	}

	const memberData = await getMemberData(name);
	if (!memberData) { // memberData is null iff name is not a key in members
		return res.status(400).send('Nonexistent member');
	}

	const returnData = {
		meetings: [],
		subtractions: [],
		status: {
			board: memberData.board,
			present: memberData.present
		}
	};
	
	const logData = (await admin.database().ref(`log/${name}`).once("value")).val();
	
	if (logData) {
		if (logData.meetings) {
			for (const date of Object.keys(logData.meetings)) {
				const fbDayLog = logData.meetings[date];
				// TODO: Make log an array of 2D tuples representing [sign-in-time, sign-out-time]
				returnData.meetings.push({
					date,
					log: fbDayLog,
				});
			}
		}
		if (logData.subtract) {
			for (const date of Object.keys(logData.subtract)) {
				returnData.subtractions.push({
					date,
					duration: logData.subtract[date],
				});
			}
		}
	}

	return res.send(returnData);
});

exports.addcorrection = functions.https.onRequest(async (req, res) => {
	const { name, date, request } = req.query;
	if (!name || !date || !request) {
		return res.status(400).send('No name or date or request specified');
	}
	const luxonDate = DateTime.fromISO(date);
	if (!luxonDate.isValid) {
		return res.status(400).send('Invalid ISO date');
	} else if (luxonDate < DateTime.fromISO('2019-01-01') || luxonDate > DateTime.local()) {
		// correction date must be after 2019 and not in the future
		return res.status(400).send('Date not in range');
	}

	const memberData = await getMemberData(name);
	if (!memberData) { // memberData is null iff name is not a key in members
		return res.status(400).send('Nonexistent member');
	}

	// ISO datetime without milliseconds
	const nowIso = DateTime.local().setZone('America/Los_Angeles').startOf('second').toISO({
		suppressMilliseconds: true
	});

	const updates = {};
	updates[nowIso] = {
		request,
		date: luxonDate.toISODate()
	};
	admin.database().ref(`corrections/${name}`).update(updates);

	return res.send(updates);
});

exports.getcorrections = functions.https.onRequest(async (req, res) => {
	const { name } = req.query;
	const correctionsData = [];

	const addToCorrectionsArray = (name, data) => {
		if (data) {
			for (const submissionTime of Object.keys(data)) {
				correctionsData.push({
					name,
					submitted: submissionTime,
					request: data[submissionTime].request,
					date: data[submissionTime].date
				});
			}
		}
	};

	if (name) {
		const memberData = await getMemberData(name);
		if (!memberData) { // memberData is null iff name is not a key in members
			return res.status(400).send('Nonexistent member');
		}
		const data = (await admin.database().ref(`corrections/${name}`).once("value")).val();
		addToCorrectionsArray(name, data);
	} else {
		const data = (await admin.database().ref('corrections').once("value")).val();
		for (const name of Object.keys(data)) {
			addToCorrectionsArray(name, data[name]);
		}
	}
	
	return res.send(correctionsData);
});
