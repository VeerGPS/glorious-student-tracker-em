# Glorious Public School – Student Tracker (English Medium)

Attendance, marks, report cards and messages to parents — in one simple app that works on phones and computers.

Everything a teacher saves goes straight into one shared school database, so the principal / office sees it on the **School overview** within seconds.

---

## For teachers

The app has five pages (the bar at the bottom on a phone):

| Page | What you do there |
|---|---|
| **Home** | See each of your classes: is today's attendance done, how many marks are entered. |
| **Attendance** | Everyone starts as **present**. Tap a name to mark **absent**, then **Save**. One more tap sends a WhatsApp message to the parents of absent children. |
| **Marks** | **New test** → pick the subjects and maximum marks → type the marks (on a phone, one subject at a time; press Enter to go to the next child). Or **Upload marks from Excel**. |
| **Students** | Upload your class list from Excel or add children one by one. Open a child's **Insights** (strengths, weak subjects, test-by-test progress against the class), download a report card, or copy a child's private parent link. |
| **Send** | Choose: **Report cards**, **Absent students**, **Low marks alert** or **Notice** → check the list → send. |

Type **AB** for a student who was absent in a test.

### Excel files

You can upload the sheets you already use. The app understands:

- **One heading row:** `Roll No | Student Name | Science (30) | Maths (50) | …` — the number in brackets is the maximum marks.
- **The school's periodic-test sheet:** a row of subjects (`Sci 30)`, `Eng 30) poem`, `SS(30) Ch 2`) above a row with `No. | Student Name | date | date …`. Two tests of the same subject on different dates stay separate.
- An optional **Max marks** row just under the headings.

Before anything is saved you see a check screen: which test it goes into, the subjects found, new students that will be added, and any marks that look wrong (with the row number). Nothing is saved until you press **Save marks**.

Tip: on a test's page, **Excel → Download sheet to fill in** gives you a sheet with your students' names already in it.

### Messages to parents

- If the office has linked the **school WhatsApp**, one tap sends every message with the **report card PDF file attached**, with live progress. If a file cannot be attached, the parent gets a download link instead and the list says so.
- If not, on a phone tap **Share PDF**, choose WhatsApp and pick the parent: the PDF file goes with the message. Each parent also has an **Open WhatsApp** button with the message already written; for report cards it includes a link where the parent downloads the PDF (when the app runs on a website address).

---

## For the principal / office

1. **First sign-in:** choose **Principal / Office**. On the very first sign-in, use the old passcode, and the app asks you to choose a new password straight away. (Or set `ADMIN_PASSWORD` on the server before the first start.)
2. **Teachers** (top menu → Teachers): add each teacher with their mobile number, a password and their classes. The app shows the sign-in details ready to send on WhatsApp. Teachers can also ask for an account from the sign-in page; you approve it here. A forgotten password is reset here too.
3. **Settings → School WhatsApp:** link the school's WhatsApp number once by scanning the code with the school phone (*WhatsApp → Linked devices → Link a device*). Then use **Send test PDF** with your own number to check that report cards arrive.
4. **Settings → School details:** the name and address printed on report cards, and (optionally) the website address used in parent links.
5. **Settings → Download full backup** any time.

The **School overview** updates by itself and shows:

- filters for classroom, subject and dates;
- tiles for students, average score, today's attendance, pass rate, tests held and the top subject;
- charts: class benchmark (coloured by result band), performance over time, subject-wise averages and the grade distribution;
- every classroom with its teachers, average, pass rate, attendance and a status badge;
- an honour roll (top students of each class), the faculty, and a searchable student directory;
- **AI Insights** for any student: a plain-language reading of their results with suggested next steps.

### Parents

Parents choose **Parent** on the sign-in page and enter class, roll number and the mobile number registered with the school — or open the private link a teacher sent them. They see marks, rank, attendance and can download the report card.

---

## Running the app

Needs **Node.js 22.12 or newer**.

### On the school computer (Windows)

Double-click **`Start App.bat`**. The first time it installs what it needs (internet required), then opens the app in the browser. Other phones on the school Wi-Fi can open the "On school Wi-Fi" address shown in the server window.

Data is saved in the `data` folder next to the app (back it up), or in MongoDB if a connection string is set in a `.env` file:

```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
```

### On Render (online)

`render.yaml` is ready. Set these environment variables in the Render dashboard:

| Variable | Needed | What it is |
|---|---|---|
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string. Render's free disk is wiped on restart, so the data must live in MongoDB. |
| `ADMIN_PASSWORD` | No | The first office password (otherwise the old passcode works once and must be changed). |
| `SESSION_SECRET` | No | Signs sign-in tokens. Generated and stored in the database if not set. |

The WhatsApp link is also stored in MongoDB, so it survives restarts — no new QR scan after Render restarts the app.

If the app cannot connect to MongoDB, the page says why (wrong password, mistyped connection string, Atlas **Network Access** not allowing Render, paused cluster) and keeps retrying. After changing the database password, update the variable the app actually uses: `MONGODB_URI_EM` wins over `MONGODB_URI` if both are set. A password with characters like `@ # / :` can be pasted as it is.

Other options: `PORT` (default 5001), `DATA_DIR`, `MONGODB_DB` (default `gps_english_medium`), `WHATSAPP_DISABLED=1`.

### Moving from the previous version

- On first start, everything the old version stored in MongoDB (teachers, students, marks, attendance) is **copied in automatically**. Old teacher passwords keep working (they are now stored securely). Nothing is deleted from the old records.
- Some data from the old version lived only inside each teacher's browser. When a teacher signs in on that phone or computer, the app offers **"Copy it now"**. This only adds what is missing and never overwrites.
- Old parent links (`?student=5&std=8`) no longer work, because anyone could guess them. Parents can sign in with class, roll number and mobile, or use the new private link.
- **Important:** the previous version made the MongoDB password and the WhatsApp login files downloadable from the website. **Change the MongoDB Atlas database user's password** (and update `MONGODB_URI`), and **re-link WhatsApp** after upgrading.

---

## How it works (for developers)

```
server.js            Starts the server, opens the database, serves public/ only
src/api.js           All API routes, sign-in and permissions
src/store.js         Records kept in memory, each saved on its own (MongoDB or data/school-data.json)
src/reports.js       Report calculations (totals, grades, ranks, attendance, remarks)
src/pdf.js           Report card PDFs (one renderer for teachers, parents and WhatsApp)
src/legacy.js        Copies data from the previous version
src/whatsapp.js      School WhatsApp link (Baileys) and paced sending
public/              The web app (plain JavaScript modules, no build step)
test/                npm test
```

- Each student, test, attendance day and teacher is a separate record, so two teachers saving at the same time never overwrite each other.
- Teachers only see and change their own classes; the office sees everything. Passwords are hashed (scrypt); sign-in uses signed tokens.
- Only the files in `public/` are served. A strict Content-Security-Policy is set and all page text is escaped.

Run the tests with `npm test`.
