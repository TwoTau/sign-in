'use strict';

// Constants for MomentJS formats
const DATE_FORMAT_MEETING_KEY = "YY-MM-DD";
const TIME_FORMAT_MEETING_VALUE = "HH:mm:ss";
const DATE_FORMAT_MEETING_UI = "M/D";
const TIME_FORMAT_MEETING_UI = "h:mm[<span>]a[</span>]";
const DATETIME_FORMAT_CORRECTIONS_KEY = "YY-MM-DD HH:mm";
const DATE_FORMAT_CORRECTIONS_VALUE = "MM/DD/YY";

// Discord Log webhook urls
const DISCORD_SIGN_IN_WEBHOOK_URL = "https://discordapp.com/api/webhooks/.../...";
const DISCORD_SIGN_OUT_WEBHOOK_URL = "https://discordapp.com/api/webhooks/.../...";
const DISCORD_CORRECTION_WEBHOOK_URL = "https://discordapp.com/api/webhooks/.../...";

// Firebase constants
const FIREBASE_API_KEY = "...";
const FIREBASE_AUTH_DOMAIN = "....firebaseapp.com";
const FIREBASE_DATABASE_URL = "https://....firebaseio.com";

let members = []; // list of everyone's names

$(function() {
    // Initialize Firebase
    firebase.initializeApp({
        apiKey: FIREBASE_API_KEY,
        authDomain: FIREBASE_AUTH_DOMAIN,
        databaseURL: FIREBASE_DATABASE_URL,
        storageBucket: ""
    });

    function getTimeInMeetingValueFormat() {
        return moment().format(TIME_FORMAT_MEETING_VALUE);
    }

    let nameSelected = "";

    let nameCorrectionSelected = "";

    let presentMembers = []; // list of names of people that are present
    let boardMembers = []; // list of names of people that need 60 hours

    function addToPresentMembersList(name) {
        presentMembers.push(name);
    }
    function removeFromPresentMembersList(name) {
        presentMembers.splice($.inArray(name, presentMembers), 1);
    }
    function updatePresentMembersList() {
        presentMembers.sort();
        $("#present-list").html("<li><span>" + presentMembers.join("</span></li><li><span>") + "</span></li>");
    }

    function loadMembersToList() {
        firebase.database().ref("members").once("value").then(snapshot => {
            const data = snapshot.val();
            members = Object.keys(data);

            for(const memberName of members) {
                if(data[memberName].present) {
                    const todayDate = moment().format(DATE_FORMAT_MEETING_KEY);

                    addToPresentMembersList(memberName); // assume member was signed in that day

                    firebase.database().ref(`log/${memberName}/meetings/${todayDate}`).once("value").then(snapshot => {
                        let data = snapshot.val();
                        if(!data) { // member did not sign out the day before
                            // remove present status from member
                            removeFromPresentMembersList(memberName);
                            firebase.database().ref("members/" + memberName).update({
                                "present": false
                            });
                            updatePresentMembersList();
                        }
                    });

                }
                if(data[memberName].board) {
                    boardMembers.push(memberName);
                }
            }

            updatePresentMembersList();
        });
    }

    loadMembersToList();

    $("#name").autoComplete({
        minChars: 1,
        delay: 50,
        source: function(term, suggest) {
            term = term.toLowerCase();
            let matches = members.filter(memberName => ~memberName.toLowerCase().indexOf(term));
            matches.sort((a, b) => {
                a = a.toLowerCase().indexOf(term);
                b = b.toLowerCase().indexOf(term);
                if(a < b) {
                    return -1;
                } else if(a > b) {
                    return 1;
                }
                return 0;
            });
            suggest(matches);
        },
        onSelect: (event, term) => {
            selectMember(term);
        }
    });

    $("#name").on("keydown", e => {
        // there is a name selected and neither enter nor tab nor an arrow key has been pressed
        if(nameSelected.length > 1 && !(e.which === 13 || e.which === 9 || (e.which >= 16 && e.which <= 18) || (e.which >= 37 && e.which <= 40))) {
            deselectCurrentMember();
        }
    });

    function deselectCurrentMember() {
        nameSelected = "";
        $("#name").val("");
        hideProfileAndButtons();
    }

    $("#present-list").on("click", "li span", function() {
        const nameClicked = $(this).text();
        $("#name").val(nameClicked);
        selectMember(nameClicked);
    });

    function isSignedIn(todayData) {
        if(!todayData) {
            return false;
        }
        let i = 0;
        while(todayData["start" + i]) {
            if(!todayData["end" + i]) { // hadn't signed out that day
                return true;
            }
            ++i;
        }
        return false;
    }

    function selectMember(memberName) {
        nameSelected = memberName;

        hideProfileAndButtons(); // in case the database does not load

        firebase.database().ref(`log/${nameSelected}`).once("value").then(snapshot => {
            let data = snapshot.val();
            let meetingData = {};
            let subtractData = {};
            if(data) {
                meetingData = data.meetings;
                subtractData = data.subtract;
            }
            fillProfileWithData(meetingData, subtractData, nameSelected);
            showProfileAndButtons();
        });
    }

    function hideProfileAndButtons() {
        $("#change-button-container").hide();
        $("#member-details").css("visibility", "hidden");
        $("#button-container").fadeOut(200);
    }

    function showProfileAndButtons() {
        $("#change-button-container").show();
        $("#member-details").css("visibility", "visible").fadeTo(100, 1);
        $("#button-container").fadeIn(100);
    }

    function fillProfileWithData(meetingData, subtractData, _nameSelected) {
        const todayDate = moment().format(DATE_FORMAT_MEETING_KEY);
        if(meetingData && isSignedIn(meetingData[todayDate])) { // signed in and present
            $("#sign-in").addClass("disabled");
            $("#sign-out").removeClass("disabled");
        } else { // did not ever sign in today or already signed out
            $("#sign-in").removeClass("disabled");
            $("#sign-out").addClass("disabled");
        }

        let totalTimeInSec = 0;
        let timeRows = "";

        $.each(subtractData, function(date, timeRemoved) {
            const dateInUiFormat = moment(date, DATE_FORMAT_MEETING_KEY).format(DATE_FORMAT_MEETING_UI);

            timeRows += "<tr class='subtracted'><td>" + dateInUiFormat + "</td><td>😠</td><td>😠</td><td>-" + timeRemoved + "</td></tr>";

            totalTimeInSec -= timeDiffInSec("0:00:00", timeRemoved + ":00");
        });

        $.each(meetingData, function(date, timesLog) {
            let i = 0;
            while(timesLog["start" + i]) {
                const startTime = timesLog["start" + i];

                const dateInUiFormat = moment(date, DATE_FORMAT_MEETING_KEY).format(DATE_FORMAT_MEETING_UI);
                const startTimeFormatted = moment(startTime, TIME_FORMAT_MEETING_VALUE).format(TIME_FORMAT_MEETING_UI);

                let endTime;
                let endTimeFormatted;

                if(timesLog["end" + i]) { // signed out that same day
                    endTime = timesLog["end" + i];
                    endTimeFormatted = moment(endTime, TIME_FORMAT_MEETING_VALUE).format(TIME_FORMAT_MEETING_UI);
                    timeRows += "<tr>";
                } else if(date === todayDate) { // still signed in
                    endTime = getTimeInMeetingValueFormat();
                    endTimeFormatted = moment(endTime, TIME_FORMAT_MEETING_VALUE).format(TIME_FORMAT_MEETING_UI);
                    timeRows += "<tr class='not-logged-out today'>";
                } else { // did not log out that day
                    endTime = startTime; // so that timeDiff will be 0
                    endTimeFormatted = "~";
                    timeRows += "<tr class='not-logged-out'>";
                }

                const timeDiff = timeDiffInSec(startTime, endTime);
                const timeDiffFormatted = toTwelveHourTime(secondsToFormattedTime(timeDiff));
                totalTimeInSec += timeDiff;

                timeRows += "<td>" + dateInUiFormat + "</td><td>" + startTimeFormatted + "</td><td>" + endTimeFormatted + "</td><td>" + timeDiffFormatted + "</td></tr>";

                ++i;
            }
        });

        if(_nameSelected === nameSelected) { // if still selected
            const timeNeededInSec = 3600 * (($.inArray(nameSelected, boardMembers) === -1) ? 40 : 80);
            const totalTimeLeftInSec = timeNeededInSec - totalTimeInSec;
            $("#hours-completed").text(secondsToFormattedTime(totalTimeInSec));
            if(totalTimeLeftInSec > 0) {
                $("#hours-left").html(secondsToFormattedTime(totalTimeLeftInSec));
            } else { // finished
                $("#hours-left").html("<span class='flashy-done'>0</span>");
            }
            $("#attendance tbody").html(timeRows);
        }
    }

    $("#sign-in").click(function() {
        if(nameSelected !== "" && $("#sign-out").hasClass("disabled")) {
            signInOut(nameSelected, true);
        }
    });

    $("#sign-out").click(function() {
        if(nameSelected !== "" && $("#sign-in").hasClass("disabled")) {
            signInOut(nameSelected, false);
        }
    });

    // signIn is either true or false
    function signInOut(name, signIn) {
        const todayDate = moment().format(DATE_FORMAT_MEETING_KEY);
        const startOrEnd = (signIn ? "start" : "end");
        firebase.database().ref(`log/${name}/meetings/${todayDate}`).once("value").then(snapshot => {
            let data = snapshot.val();
            let keyNum = 0;
            while(data && data[startOrEnd + keyNum]) {
                ++keyNum;
            }
            const startOrEndKey = startOrEnd + keyNum;

            let updates = {};
            updates[`log/${name}/meetings/${todayDate}/${startOrEndKey}`] = getTimeInMeetingValueFormat();
            updates[`members/${name}/present`] = signIn;
            firebase.database().ref().update(updates);

            if(signIn) {
                addToPresentMembersList(name);
            } else {
                removeFromPresentMembersList(name);
            }
            updatePresentMembersList();
        });
        deselectCurrentMember();

        const webhookUrl = (signIn ? DISCORD_SIGN_IN_WEBHOOK_URL : DISCORD_SIGN_OUT_WEBHOOK_URL);
        const inOrOut = (signIn ? "in" : "out");
        sendDiscordWebhook(webhookUrl, `**${name}** signed ${inOrOut} at ${moment().format("h:mm A")}.`);
    }

    $("#correction").on("click", function() {
        nameCorrectionSelected = nameSelected; // needed because async stuff
        resetCorrectionModal();
        $("#modal h2 span").text(nameCorrectionSelected.split(" ")[0]);
        $(".modal-background").css("display", "flex");
    });

    $("#submit-correction").click(function() {
        const correction = $("#correction-input").val();

        if(correction) {
            const date = moment($("#date-to-correct").val(), "YYYY-MM-DD").format(DATE_FORMAT_CORRECTIONS_VALUE);
            let update = {};
            update[moment().format(DATETIME_FORMAT_CORRECTIONS_KEY)] = date + ": " + correction;
            firebase.database().ref(`corrections/${nameCorrectionSelected}`).update(update, () => {
                alert(`Your correction "${correction}" has been recorded.`);
                sendDiscordWebhook(DISCORD_CORRECTION_WEBHOOK_URL, `**${nameCorrectionSelected}** submitted correction for ${date}: "${correction}" at ${moment().format("h:mm A")}.`);
            });
            fadeOutModal();
        }
    });

    $("#cancel-correction").click(fadeOutModal);

    $(".modal-background").click(fadeOutModal);
    $("#modal").click(function(e) {
        e.stopPropagation();
    });

    function fadeOutModal() {
        $(".modal-background").fadeOut(200);
    }

    function resetCorrectionModal() {
        $("#date-to-correct").val(moment().format("YYYY-MM-DD"));
        $("#correction-input").val("");
    }

    resetCorrectionModal();

	$("#edit").click(function() {
		alert("Every build meeting that you go to, you should make sure to sign in after entering and sign out before leaving. If you sign in for a meeting and do not sign out, those hours won't be recorded. If you ever forget to sign in or out, submit a correction using the \"Submit Correction\" at the bottom right hand corner and mention the date and times to correct. PLEASE don't sign in or sign out for anyone else.\nAlso, if you type !log in our Discord server, SpartaBot will DM you a time log.");
	});
});

// both parameters in TIME_FORMAT_MEETING_VALUE
function timeDiffInSec(startTime, endTime) {
	const startTimeArray = startTime.split(":");
	const endTimeArray = endTime.split(":");
	const hours = (+endTimeArray[0]) - (+startTimeArray[0]);
	const minutes = (+endTimeArray[1]) - (+startTimeArray[1]);
	const seconds = (+endTimeArray[2]) - (+startTimeArray[2]);
	return (hours * 3600) + (minutes * 60) + seconds;
}

function sendDiscordWebhook(webhookUrl, content) {
    return $.post({
        url: webhookUrl,
        dataType: "json",
        data: {
            content: content
        }
    }).fail(error => {
        alert("Failed to send Discord webhook.\nThis is probably because of Discord's rate limiting.\n\nError: " + error.responseText);
    });
}

// seconds to H:mm
function secondsToFormattedTime(durationInSeconds) {
    const fullHoursElapsed = Math.floor(durationInSeconds / 3600);
    let fullMinutesElapsed = Math.floor((durationInSeconds % 3600) / 60);
    if(fullMinutesElapsed < 10) {
        fullMinutesElapsed = "0" + fullMinutesElapsed;
    }
    return fullHoursElapsed + ":" + fullMinutesElapsed;
}

// converts H:mm to h:mm
function toTwelveHourTime(timeString) {
    let split = timeString.split(":");
    if(+split[0] > 12) {
        split[0] -= 12;
    }
    return split.join(":");
}
