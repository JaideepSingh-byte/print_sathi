#  Print-Sathi | Campus Smart Print Queue Service

A modern, fast, and intuitive prototype for campus print shops and students to skip the xerox line, configure print jobs, pay via UPI, and receive a 4-digit counter pickup token.

##  Tech Stack & Architecture

- **Frontend:** React 18 (modular functional components with React Hooks `useState`, `useEffect`, `useRef`).
- **Styling:** 100% Vanilla **CSS3 only** (organized semantic CSS, flexbox, CSS grid, CSS variables). **Zero third-party CSS or utility frameworks.**
- **File Processing:** Client-side binary PDF parsing for instant page count detection without server overhead.
- **Backend Architecture:** Conceptual Node.js / BaaS architecture paired with Google Firebase:
  - **Firebase Storage:** Object bucket (`/print_jobs/{orderId}/{fileName}`) for binary PDF files.
  - **Cloud Firestore:** NoSQL collection (`print_jobs`) for order metadata, payment statuses, and pickup tokens.
  - **Graceful Local Fallback:** Runs immediately out-of-the-box using browser storage so you don't need to configure Firebase API keys just to test the UI!

---

##  Core Features Built

### 1. Document Upload Zone (Strict PDF Only)
- **Drag & Drop** plus manual **Browse Files** button.
- **Strict Format Enforcement:** Accepts **ONLY `.pdf`** files.
- **Visual Warning Badge:** *"Only PDF format supported (.pdf)"*.
- **Inline Error Alert:** If a `.png`, `.docx`, or other file is dropped, a friendly alert explains why it was rejected.
- **Automatic Metadata Extraction:** Displays file name, formatted size (KB/MB), and estimated page count.
- **Replace / Remove File:** Switch files anytime with one click.

### 2. Print Configuration Form
- **Number of Copies:** Numeric stepper (increment, decrement, or direct input clamped between 1 and 100).
- **Color Mode:** High-contrast toggle cards:
  - **Black & White:** Subsidized rate of **₹1 / page**.
  - **Color:** Premium rate of **₹5 / page**.
- **Print Range:**
  - **All Pages:** Automatically selects page 1 through total pages.
  - **Custom Range:** Dynamic text box (e.g. `1-5, 8, 11-13`) that calculates unique pages in real-time and validates boundaries.
- **Sides (Duplexing):** Single-Sided vs. Double-Sided (Eco-Friendly) layout selection.

### 3. Live Price Calculation (Breakdown Card)
- **Live Recalculation:** Recomputes automatically on any change.
- **Formula:** `Total = (Calculated Pages) × (Number of Copies) × (₹1 or ₹5)`.
- **Itemized Math Preview:** `Pages × Copies × Rate = Total Amount in ₹`.
- **Paper Estimation:** Displays approximate physical sheets needed based on single vs. double-sided options.

### 4. Submission & UPI Payment Simulation
- **"Proceed to Payment & Submit"** button enabled when a valid PDF is active.
- **UPI QR Code Simulation:** Displays payment modal with generated UPI QR Code, supported UPI app tags (Google Pay, PhonePe, Paytm, BHIM), and the exact calculated bill in ₹.
- **Payment Confirmation State:**
  - Generates a unique 4-digit Counter Token (e.g., `#PS-8421`).
  - Renders a printable/saveable Counter Token Pass.
  - Gives instructions on which campus counter to visit for instant pickup.

### 5. Campus Queue & Order History Tracker
- Switch between the active form and **"My Orders"** queue to review previous print jobs.

---

## Project Structure

```
d:\Print Sathi/
├── index.html                 # HTML5 document shell & typography
├── package.json               # Project scripts (npm start) & dependencies
├── vite.config.js             # Vite configuration for port 3000 & auto-open
├── public/
│   └── favicon.svg            # Campus printer SVG icon
├── sample_documents/
│   └── Sample_Lecture_Notes_5_Pages.pdf # Ready-to-use sample PDF for testing!
└── src/
    ├── main.jsx               # Application DOM mount
    ├── App.jsx                # Main orchestration component & state
    ├── App.css                # 100% Vanilla CSS3 design system
    ├── components/
    │   ├── Navbar.jsx         # Campus branding & status pill
    │   ├── UploadZone.jsx     # Drag & drop strict PDF upload
    │   ├── PrintConfig.jsx    # Copies stepper, color, range & sides
    │   ├── PriceBreakdown.jsx # Real-time mathematical price breakdown
    │   ├── PaymentModal.jsx   # Simulated UPI payment & QR code
    │   ├── OrderConfirmation.jsx # 4-digit token counter pass
    │   └── RecentOrders.jsx   # Queue history & order status
    ├── services/
    │   └── firebase.js        # Firebase architecture & local fallback
    └── utils/
        └── pdfHelper.js       # Client-side PDF page counter & range parser
```

---

## How Firebase Works in Print-Sathi

In production, two Firebase services work in tandem:

1. **Firebase Storage (Blob Storage):**
   ```javascript
   import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
   
   const storageRef = ref(storage, `print_jobs/${orderId}/${file.name}`);
   const snapshot = await uploadBytes(storageRef, file);
   const fileUrl = await getDownloadURL(snapshot.ref);
   ```

2. **Cloud Firestore (NoSQL Database):**
   ```javascript
   import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
   
   await setDoc(doc(db, "print_jobs", orderId), {
     orderId: "PS-8421",
     token: "8421",
     fileName: file.name,
     fileUrl: fileUrl,
     totalPages: 12,
     calculatedPages: 5,
     copies: 2,
     colorMode: "bw",
     totalAmount: 10,
     status: "pending",
     createdAt: serverTimestamp()
   });
   ```
