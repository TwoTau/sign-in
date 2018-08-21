# Sign-in
A real-time online sign-in system integrated into Discord with Firebase.

## Structure of Firebase JSON
Example: [firebase-structure.json](firebase-structure.json).

The database is organized into three categories, `corrections`, `log`, and `members`:
- `corrections` contains messages that members send to the database organizer to manually change something in the database.
- `log` contains the `meetings` and `subtract` for each member
- `members` contains data about each member

![Screenshot when signing in](https://user-images.githubusercontent.com/14433542/42856412-07ef9852-89fa-11e8-8650-f6224e8e711e.png)

![Screenshot when signing out](https://user-images.githubusercontent.com/14433542/42856533-7b107a72-89fa-11e8-82b9-179a4e795150.png)

## Firebase rules

Ensures that:
- `corrections/$membername` has valid datetime keys (YY-MM-DD HH:mm)
- `log/$membername/meetings/$date` has a valid date (YY-MM-DD) and valid start and end times (HH:mm:ss)
- `members/$membername` has a Boolean `board`, a Boolean `present`, and a String `discordId` as children
- All `$membername` in `corrections` or `log` are also in `members`

```json
{
  "rules": {
    ".read": true,
    "corrections": {
      "$membername": {
        ".write": "root.child('members').hasChild($membername)",
        "$datetime": {
          ".validate": "$datetime.matches(/^\\d{2}\\-(0[1-9]|1[012])\\-(0[1-9]|[12][0-9]|3[01]) (2[0-3]|[0|1]\\d):[0-5]\\d$/)"
        }
      }
    },
    "log": {
      "$membername": {
        ".write": "root.child('members').hasChild($membername)",
        "meetings": {
          "$day": {
            ".validate": "$day.matches(/^\\d{2}\\-(0[1-9]|1[012])\\-(0[1-9]|[12][0-9]|3[01])$/)",
            "$endstart": {
              ".validate": "$endstart.matches(/^(start|end)(0|[1-9]\\d*)$/) && newData.isString() && newData.val().matches(/^(2[0-3]|[0|1]\\d):[0-5]\\d:[0-5]\\d$/)"
            }
          }
        }
      }
    },
    "members": {
      ".write": true,
      "$membername": {
        ".validate": "newData.hasChildren(['board', 'discordId', 'present'])",
        "board": {
          ".validate": "newData.isBoolean()"
        },
        "discordId": {
          ".validate": "newData.isString()"
        },
        "present": {
          ".validate": "newData.isBoolean()"
        }
      }
    }
  }
}
```
