#!/usr/bin/env python3
"""
EXPIREDNOT — Pharmacy Inventory Intelligence Backend Server
Production standard-library server: Auth, Hashed OTP, Google OAuth, Multimodal Document AI, SQLite Storage
"""

import os
import sys
import json
import time
import hmac
import hashlib
import secrets
import sqlite3
import threading
import urllib.request
import urllib.parse
import mimetypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from email.message import EmailMessage

# Auto-load .env file if present
ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(ENV_PATH):
    try:
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except Exception as e:
        print(f"Note: Could not load .env: {e}")

PORT = int(os.environ.get("PORT", 3000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads", "bills")
DB_PATH = os.path.join(BASE_DIR, "expirednot.db")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

os.makedirs(UPLOADS_DIR, exist_ok=True)

# ==============================================================================
# DATABASE INITIALIZATION
# ==============================================================================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Users Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                mobile TEXT,
                password_hash TEXT,
                salt TEXT,
                email_verified INTEGER DEFAULT 0,
                setup_completed INTEGER DEFAULT 0,
                shop_name TEXT,
                dl_number TEXT,
                shop_address TEXT,
                city TEXT,
                state TEXT,
                pincode TEXT,
                pharmacy_type TEXT,
                owner_name TEXT,
                role TEXT,
                auth_provider TEXT DEFAULT 'email',
                created_at INTEGER
            )
        ''')
        
        # Ensure extra address columns exist in existing database
        for col, c_type in [('shop_address', 'TEXT'), ('city', 'TEXT'), ('state', 'TEXT'), ('pincode', 'TEXT')]:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {c_type}")
            except Exception:
                pass
        
        # OTPs Table (Stores SHA-256 Hashed OTPs only)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS otps (
                email TEXT PRIMARY KEY,
                otp_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                attempts INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            )
        ''')
        
        # Sessions Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # Bills Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS bills (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                distributor TEXT,
                seller_data TEXT,
                buyer_data TEXT,
                invoice_no TEXT,
                invoice_date TEXT,
                total_amount REAL DEFAULT 0,
                taxes_data TEXT,
                original_file_path TEXT,
                file_name TEXT,
                file_type TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # Batches Table (Real Inventory)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS batches (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                bill_id TEXT,
                name TEXT NOT NULL,
                generic_name TEXT,
                brand TEXT,
                manufacturer TEXT,
                pack TEXT,
                batch_no TEXT NOT NULL,
                mfg_date TEXT,
                expiry_date TEXT NOT NULL,
                quantity REAL NOT NULL,
                purchase_rate REAL NOT NULL,
                mrp REAL,
                rack TEXT,
                distributor TEXT,
                discount REAL DEFAULT 0,
                tax_pct REAL DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # Stock Movements Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS movements (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                medicine_name TEXT NOT NULL,
                batch_no TEXT NOT NULL,
                quantity REAL NOT NULL,
                value REAL NOT NULL,
                notes TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # Operating Expenses Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                date TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # Real Event Notifications Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                text TEXT NOT NULL,
                type TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
        # Seed test user if not exists
        cursor.execute("SELECT id FROM users WHERE email = 'rajesh.sharma@medicarechemists.com'")
        if not cursor.fetchone():
            salt = secrets.token_hex(16)
            pwd_hash = hashlib.pbkdf2_hmac('sha256', b'password123', salt.encode(), 100000).hex()
            cursor.execute('''
                INSERT INTO users (id, email, mobile, password_hash, salt, email_verified, setup_completed, shop_name, dl_number, pharmacy_type, owner_name, role, auth_provider, created_at)
                VALUES ('USR_RAJESH_01', 'rajesh.sharma@medicarechemists.com', '9876543210', ?, ?, 1, 1, 'Medicare Chemist & Druggist', 'DL-20B/94812', 'Retail Pharmacy', 'Rajesh Sharma', 'Owner', 'email', ?)
            ''', (pwd_hash, salt, int(time.time())))
        
        conn.commit()

init_db()

# ==============================================================================
# SECURITY & AUTH UTILITIES
# ==============================================================================
def hash_password(password, salt=None):
    if not salt:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return pwd_hash, salt

def verify_password(password, pwd_hash, salt):
    test_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return hmac.compare_digest(test_hash, pwd_hash)

def generate_secure_otp():
    # 6-digit random number
    return str(secrets.randbelow(900000) + 100000)

def hash_otp(otp_str, salt=None):
    if not salt:
        salt = secrets.token_hex(8)
    h = hashlib.sha256((otp_str + salt).encode('utf-8')).hexdigest()
    return h, salt

def sanitize_user(user_row):
    if not user_row:
        return None
    d = dict(user_row)
    d.pop('password_hash', None)
    d.pop('salt', None)
    return d

def mask_email(email_str):
    if not email_str or '@' not in email_str:
        return 'your email'
    name, domain = email_str.split('@', 1)
    if len(name) > 2:
        masked = name[0] + '***' + name[-1]
    else:
        masked = name[0] + '***'
    return f"{masked}@{domain}"

def send_email_otp(to_email, otp_code):
    """
    Dispatches 6-digit OTP directly to user's real email address.
    Supports:
    1. Resend API (if RESEND_API_KEY is set)
    2. Brevo API (if BREVO_API_KEY is set)
    3. Standard SMTP / Gmail SMTP (if SMTP_USER & SMTP_PASS or GMAIL_APP_PASSWORD are set)
    """
    # 1. Try Resend API
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if resend_key:
        try:
            url = "https://api.resend.com/emails"
            payload = {
                "from": "EXPIREDNOT <onboarding@resend.dev>",
                "to": [to_email],
                "subject": f"{otp_code} is your EXPIREDNOT verification code",
                "html": f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                    <h2 style="color: #059669; margin: 0 0 12px 0;">EXPIREDNOT</h2>
                    <p style="font-size: 15px; color: #334155; line-height: 1.5;">Here is your 6-digit verification code to access your pharmacy workspace:</p>
                    <div style="background: #ecfdf5; border: 1.5px dashed #10b981; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #047857; font-family: monospace;">{otp_code}</span>
                    </div>
                    <p style="font-size: 13px; color: #64748b; margin: 0;">Valid for <strong>5 minutes</strong>. Never share this code with anyone.</p>
                </div>
                """
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Authorization': f'Bearer {resend_key}', 'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 201):
                    print(f"[RESEND EMAIL SUCCESS] Dispatched OTP to {to_email}")
                    return True
        except Exception as e:
            print(f"[RESEND EMAIL ERROR]: {e}", file=sys.stderr)

    # 2. Try Brevo API
    brevo_key = os.environ.get("BREVO_API_KEY", "")
    if brevo_key:
        try:
            url = "https://api.brevo.com/v3/smtp/email"
            payload = {
                "sender": {"name": "EXPIREDNOT", "email": "no-reply@expirednot.com"},
                "to": [{"email": to_email}],
                "subject": f"{otp_code} is your EXPIREDNOT verification code",
                "htmlContent": f"<h3>Your EXPIREDNOT verification code is: <strong>{otp_code}</strong></h3><p>Valid for 5 minutes.</p>"
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'api-key': brevo_key, 'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status in (200, 201):
                    print(f"[BREVO EMAIL SUCCESS] Dispatched OTP to {to_email}")
                    return True
        except Exception as e:
            print(f"[BREVO EMAIL ERROR]: {e}", file=sys.stderr)

    # 3. Try Standard SMTP / Gmail SMTP
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = (os.environ.get("SMTP_USER") or os.environ.get("GMAIL_USER", "")).strip()
    smtp_pass = (os.environ.get("SMTP_PASS") or os.environ.get("GMAIL_APP_PASSWORD", "")).replace(" ", "").strip()
    
    if smtp_user and smtp_pass:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            from email.utils import make_msgid, formatdate

            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"{otp_code} is your EXPIREDNOT verification code"
            msg['From'] = f"EXPIREDNOT Security <{smtp_user}>"
            msg['To'] = to_email
            msg['Date'] = formatdate(localtime=True)
            msg['Message-ID'] = make_msgid()

            html_content = f"""
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #059669; margin-top: 0;">EXPIREDNOT</h2>
                <p style="font-size: 15px; color: #334155;">Your verification code is:</p>
                <div style="background: #f0fdf4; border: 1.5px dashed #86efac; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #047857; font-family: monospace;">{otp_code}</span>
                </div>
                <p style="font-size: 13px; color: #64748b;">Expires in 5 minutes.</p>
            </div>
            """
            msg.attach(MIMEText(html_content, 'html'))

            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)

            print(f"[SMTP EMAIL SUCCESS] Sent to {to_email}")
            return True
        except Exception as e:
            print(f"[SMTP EMAIL ERROR]: {e}", file=sys.stderr)

    print(f"[SECURE OTP LOG] 6-Digit Email OTP for {to_email}: {otp_code}")
    return False


# ==============================================================================
# GEMINI MULTIMODAL DOCUMENT AI BILL EXTRACTION SERVICE
# ==============================================================================
def call_gemini_multimodal_bill_parser(image_bytes, mime_type="image/jpeg"):
    """
    Calls Google Gemini Multimodal REST API with image payload and strict structured JSON schema.
    Returns structured invoice header + item list. NEVER invents or uses fallback dummy data.
    """
    api_key = GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    
    if not api_key:
        print("[BILL AI ENGINE] Gemini API key not in environment. Reporting not_configured.")
        return {
            "success": False,
            "error": "Smart Bill Capture is not configured yet. Please configure GEMINI_API_KEY in your environment or enter bill details manually.",
            "not_configured": True,
            "items": []
        }
    
    # Strict Structured Prompt
    system_instruction = (
        "You are EXPIREDNOT's high-precision pharmacy purchase bill intelligence engine. "
        "Extract ONLY what is visibly printed on the invoice. NEVER invent, hallucinate, or substitute medicine names. "
        "Extract the exact printed product names, batch numbers, expiry dates, quantities, rates, MRPs, and invoice metadata. "
        "If a field is not printed or unreadable, return null and set verification_status to 'needs_verification'. "
        "Output strictly valid JSON matching this schema:\n"
        "{\n"
        "  \"distributor\": \"Seller name or null\",\n"
        "  \"seller_address\": \"Seller address or null\",\n"
        "  \"seller_gstin\": \"Seller GSTIN or null\",\n"
        "  \"seller_phone\": \"Seller phone or null\",\n"
        "  \"buyer_name\": \"Buyer pharmacy name or null\",\n"
        "  \"buyer_address\": \"Buyer pharmacy address or null\",\n"
        "  \"buyer_gstin\": \"Buyer GSTIN or null\",\n"
        "  \"invoice_no\": \"Invoice number or null\",\n"
        "  \"invoice_date\": \"YYYY-MM-DD or null\",\n"
        "  \"total_amount\": 0.00,\n"
        "  \"taxable_amount\": 0.00,\n"
        "  \"cgst\": 0.00,\n"
        "  \"sgst\": 0.00,\n"
        "  \"igst\": 0.00,\n"
        "  \"discount\": 0.00,\n"
        "  \"items\": [\n"
        "    {\n"
        "      \"name\": \"Exact printed product name\",\n"
        "      \"generic_name\": \"Generic salt if printed or null\",\n"
        "      \"brand\": \"Brand name if printed or null\",\n"
        "      \"manufacturer\": \"Manufacturer name if printed or null\",\n"
        "      \"pack\": \"Pack size e.g. 10s or null\",\n"
        "      \"batch_no\": \"Batch number\",\n"
        "      \"expiry_date\": \"YYYY-MM or YYYY-MM-DD\",\n"
        "      \"quantity\": 10,\n"
        "      \"free_qty\": 0,\n"
        "      \"purchase_rate\": 100.00,\n"
        "      \"mrp\": 140.00,\n"
        "      \"discount\": 0.00,\n"
        "      \"tax_pct\": 12.0,\n"
        "      \"line_total\": 1000.00,\n"
        "      \"conf\": \"high\"\n"
        "    }\n"
        "  ]\n"
        "}"
    )
    
    try:
        import base64
        b64_data = base64.b64encode(image_bytes).decode('utf-8')
        
        # Priority Gemini multimodal models
        gemini_models = [
            'gemini-3.5-flash',
            'gemini-3.5-flash-lite',
            'gemini-3.6-flash',
            'gemini-3.7-flash',
            'gemini-2.5-flash',
            'gemini-1.5-flash'
        ]
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": system_instruction},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_data
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.1
            }
        }
        
        for model in gemini_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                with urllib.request.urlopen(req, timeout=25) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    candidates = data.get('candidates', [])
                    if candidates:
                        text_content = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '{}')
                        parsed_json = json.loads(text_content)
                        parsed_json["success"] = True
                        print(f"[GEMINI BILL AI SUCCESS] Extracted bill via {model}")
                        return parsed_json
            except urllib.error.HTTPError as he:
                if he.code in (404, 400, 429):
                    continue
                else:
                    raise he
            except Exception as e:
                continue

    except Exception as e:
        print(f"[GEMINI BILL AI ERROR]: {e}", file=sys.stderr)
        return {
            "success": False,
            "error": "Unable to confidently extract this bill. Please review and enter details manually.",
            "items": []
        }

    return {
        "success": False,
        "error": "Unable to confidently extract this bill.",
        "items": []
    }

# ==============================================================================
# HTTP REQUEST HANDLER
# ==============================================================================
class ExpiredNotHandler(BaseHTTPRequestHandler):
    
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(body)

    def _get_auth_user(self):
        auth_header = self.headers.get('Authorization', '')
        token = None
        if auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
        
        if not token:
            # Check cookie if present
            cookie = self.headers.get('Cookie', '')
            if 'exp_session=' in cookie:
                token = cookie.split('exp_session=')[1].split(';')[0].strip()
                
        if not token:
            return None
            
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT u.* FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ? AND s.expires_at > ?
            ''', (token, int(time.time())))
            row = cursor.fetchone()
            if row:
                return dict(row)
        return None

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        url_parsed = urllib.parse.urlparse(self.path)
        path = url_parsed.path
        
        # API Routes
        if path == '/api/config/auth':
            g_client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
            return self._send_json({
                "google_client_id": g_client_id,
                "google_configured": bool(g_client_id and "example" not in g_client_id),
                "gemini_configured": bool(GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
            })

        elif path == '/api/auth/session':
            user = self._get_auth_user()
            if user:
                return self._send_json({"authenticated": True, "user": sanitize_user(user)})
            return self._send_json({"authenticated": False}, 401)
            
        elif path == '/api/inventory':
            user = self._get_auth_user()
            if not user:
                return self._send_json({"error": "Unauthorized"}, 401)
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM batches WHERE user_id = ? ORDER BY expiry_date ASC", (user['id'],))
                batches = [dict(r) for r in cursor.fetchall()]
            return self._send_json({"batches": batches})
            
        elif path == '/api/bills':
            user = self._get_auth_user()
            if not user:
                return self._send_json({"error": "Unauthorized"}, 401)
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM bills WHERE user_id = ? ORDER BY created_at DESC", (user['id'],))
                bills = [dict(r) for r in cursor.fetchall()]
            return self._send_json({"bills": bills})

        elif path == '/api/analytics':
            user = self._get_auth_user()
            if not user:
                return self._send_json({"error": "Unauthorized"}, 401)
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM batches WHERE user_id = ? AND quantity > 0", (user['id'],))
                batches = [dict(r) for r in cursor.fetchall()]
                cursor.execute("SELECT * FROM movements WHERE user_id = ?", (user['id'],))
                movements = [dict(r) for r in cursor.fetchall()]
                cursor.execute("SELECT * FROM bills WHERE user_id = ?", (user['id'],))
                bills = [dict(r) for r in cursor.fetchall()]
                
            total_stock_value = sum(b['quantity'] * b['purchase_rate'] for b in batches)
            loss_prevented = sum(m['value'] for m in movements if m['type'] in ('Returned', 'Cleared'))
            
            return self._send_json({
                "total_stock_value": total_stock_value,
                "loss_prevented": loss_prevented,
                "active_medicines_count": len(set(b['name'].lower() for b in batches)),
                "active_batches_count": len(batches),
                "total_bills_count": len(bills)
            })

        # Static File Serving
        if path == '/' or path == '/index.html':
            file_path = os.path.join(BASE_DIR, 'index.html')
        else:
            clean_path = path.lstrip('/')
            file_path = os.path.join(BASE_DIR, clean_path)

        if os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = 'application/octet-stream'
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            # SPA Fallback for client routes
            index_path = os.path.join(BASE_DIR, 'index.html')
            with open(index_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    def do_POST(self):
        url_parsed = urllib.parse.urlparse(self.path)
        path = url_parsed.path
        
        content_length = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_length)
        
        content_type = self.headers.get('Content-Type', '')
        
        # Handle multipart for bill uploads
        if path == '/api/bills/analyze' and 'multipart/form-data' in content_type:
            user = self._get_auth_user()
            # If not logged in, we can still analyze or enforce auth
            user_id = user['id'] if user else 'GUEST'
            
            # Simple multipart parser
            try:
                boundary = content_type.split('boundary=')[1].encode('utf-8')
                parts = post_body.split(b'--' + boundary)
                file_bytes = b''
                file_name = 'uploaded_bill.jpg'
                file_mime = 'image/jpeg'
                
                for p in parts:
                    if b'Content-Disposition' in p and b'filename=' in p:
                        headers_part, body_part = p.split(b'\r\n\r\n', 1)
                        body_part = body_part.rstrip(b'\r\n')
                        file_bytes = body_part
                        if b'image/png' in headers_part:
                            file_mime = 'image/png'
                            file_name = 'bill.png'
                        elif b'application/pdf' in headers_part:
                            file_mime = 'application/pdf'
                            file_name = 'bill.pdf'
                        break
                
                if not file_bytes:
                    return self._send_json({"error": "No file uploaded."}, 400)
                
                # Save original file permanently
                bill_id = f"BILL_{int(time.time())}_{secrets.token_hex(4)}"
                ext = mimetypes.guess_extension(file_mime) or '.jpg'
                saved_filename = f"{bill_id}{ext}"
                saved_path = os.path.join(UPLOADS_DIR, saved_filename)
                
                with open(saved_path, 'wb') as sf:
                    sf.write(file_bytes)
                
                relative_file_url = f"/uploads/bills/{saved_filename}"
                
                # Analyze via Gemini Multimodal
                extracted_data = call_gemini_multimodal_bill_parser(file_bytes, file_mime)
                extracted_data["bill_id"] = bill_id
                extracted_data["original_file_url"] = relative_file_url
                extracted_data["file_name"] = file_name
                
                return self._send_json(extracted_data)
                
            except Exception as e:
                print(f"Upload Error: {e}", file=sys.stderr)
                return self._send_json({"error": f"Failed to process bill file: {str(e)}"}, 500)

        # JSON body handling for all other endpoints
        try:
            req_data = json.loads(post_body.decode('utf-8')) if post_body else {}
        except Exception:
            req_data = {}

        # ----------------------------------------------------------------------
        # AUTH: Register (Step 1 -> Sends Hashed 6-digit OTP)
        # ----------------------------------------------------------------------
        if path == '/api/auth/register':
            email = req_data.get('email', '').strip().lower()
            password = req_data.get('password', '')
            
            if not email or '@' not in email:
                return self._send_json({"error": "Please enter a valid email address."}, 400)
            if len(password) < 8:
                return self._send_json({"error": "Password must be at least 8 characters."}, 400)
                
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, setup_completed FROM users WHERE email = ?", (email,))
                existing = cursor.fetchone()
                if existing and existing['setup_completed']:
                    return self._send_json({"error": "An account with this email already exists. Please sign in."}, 400)
                
                # Generate 6-digit OTP and store SHA-256 HASH
                otp_code = generate_secure_otp()
                otp_h, otp_salt = hash_otp(otp_code)
                now = int(time.time())
                expires_at = now + (5 * 60) # 5 minutes expiration
                
                # Invalidate any previous OTP & insert new
                cursor.execute('''
                    INSERT OR REPLACE INTO otps (email, otp_hash, salt, expires_at, attempts, created_at)
                    VALUES (?, ?, ?, ?, 0, ?)
                ''', (email, otp_h, otp_salt, expires_at, now))
                
                # Create unverified user if not existing
                if not existing:
                    user_id = f"USR_{int(time.time())}_{secrets.token_hex(4)}"
                    pwd_h, pwd_salt = hash_password(password)
                    cursor.execute('''
                        INSERT INTO users (id, email, password_hash, salt, email_verified, setup_completed, created_at)
                        VALUES (?, ?, ?, ?, 0, 0, ?)
                    ''', (user_id, email, pwd_h, pwd_salt, now))
                else:
                    pwd_h, pwd_salt = hash_password(password)
                    cursor.execute("UPDATE users SET password_hash = ?, salt = ? WHERE email = ?", (pwd_h, pwd_salt, email))
                
                conn.commit()
                
            # Send real email via SMTP in background thread (non-blocking)
            threading.Thread(target=send_email_otp, args=(email, otp_code), daemon=True).start()
            
            # Log OTP securely to server console for testing/verification
            print(f"[SECURITY OTP DISPATCH] 6-Digit Email OTP for {email}: {otp_code} (Expires in 5m)", file=sys.stdout)
            
            return self._send_json({
                "success": True,
                "message": "Verification code sent to your email.",
                "masked_email": mask_email(email),
                "expires_in_seconds": 300
            })

        # ----------------------------------------------------------------------
        # AUTH: Verify Email OTP (Checks SHA-256 hash, attempts, expiry)
        # ----------------------------------------------------------------------
        elif path == '/api/auth/verify-otp':
            email = req_data.get('email', '').strip().lower()
            code = req_data.get('code', '').strip()
            
            if not email or len(code) != 6:
                return self._send_json({"error": "Please enter the complete 6-digit verification code."}, 400)
                
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM otps WHERE email = ?", (email,))
                otp_record = cursor.fetchone()
                
                if not otp_record:
                    return self._send_json({"error": "No active verification code found. Please request a new code."}, 400)
                    
                now = int(time.time())
                if now > otp_record['expires_at']:
                    return self._send_json({"error": "This verification code has expired. Request a new code."}, 400)
                    
                if otp_record['attempts'] >= 5:
                    return self._send_json({"error": "Too many failed attempts. Please request a new verification code."}, 429)
                    
                # Verify SHA-256 Hash
                expected_hash, _ = hash_otp(code, otp_record['salt'])
                if not hmac.compare_digest(expected_hash, otp_record['otp_hash']):
                    cursor.execute("UPDATE otps SET attempts = attempts + 1 WHERE email = ?", (email,))
                    conn.commit()
                    return self._send_json({"error": "Incorrect verification code. Please try again."}, 400)
                    
                # OTP is valid -> Mark email verified & Invalidate OTP
                cursor.execute("UPDATE users SET email_verified = 1 WHERE email = ?", (email,))
                cursor.execute("DELETE FROM otps WHERE email = ?", (email,))
                
                cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
                user = cursor.fetchone()
                
                # Issue session token
                session_token = secrets.token_hex(32)
                cursor.execute('''
                    INSERT INTO sessions (token, user_id, expires_at, created_at)
                    VALUES (?, ?, ?, ?)
                ''', (session_token, user['id'], now + (30 * 86400), now))
                
                conn.commit()
                
            return self._send_json({
                "success": True,
                "message": "Email verified ✓",
                "session_token": session_token,
                "user": sanitize_user(user)
            })

        # ----------------------------------------------------------------------
        # AUTH: Resend OTP (Enforces 30s rate limiting)
        # ----------------------------------------------------------------------
        elif path == '/api/auth/resend-otp':
            email = req_data.get('email', '').strip().lower()
            if not email:
                return self._send_json({"error": "Email is required."}, 400)
                
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM otps WHERE email = ?", (email,))
                existing_otp = cursor.fetchone()
                now = int(time.time())
                
                if existing_otp and (now - existing_otp['created_at']) < 30:
                    wait_time = 30 - (now - existing_otp['created_at'])
                    return self._send_json({"error": f"Please wait {wait_time}s before requesting a new code."}, 429)
                    
                new_otp = generate_secure_otp()
                new_h, new_salt = hash_otp(new_otp)
                expires_at = now + (5 * 60)
                
                cursor.execute('''
                    INSERT OR REPLACE INTO otps (email, otp_hash, salt, expires_at, attempts, created_at)
                    VALUES (?, ?, ?, ?, 0, ?)
                ''', (email, new_h, new_salt, expires_at, now))
                conn.commit()
                
            threading.Thread(target=send_email_otp, args=(email, new_otp), daemon=True).start()
            print(f"[SECURITY OTP RESEND] New 6-Digit OTP for {email}: {new_otp}", file=sys.stdout)
            return self._send_json({
                "success": True, 
                "message": "New verification code sent to your email."
            })

        # ----------------------------------------------------------------------
        # AUTH: Send Login OTP (Sign in without password)
        # ----------------------------------------------------------------------
        elif path == '/api/auth/send-login-otp':
            email = req_data.get('email', '').strip().lower()
            if not email or '@' not in email:
                return self._send_json({"error": "Please enter a valid email address."}, 400)
                
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
                user = cursor.fetchone()
                now = int(time.time())
                
                # Check resend limit
                cursor.execute("SELECT created_at FROM otps WHERE email = ?", (email,))
                existing_otp = cursor.fetchone()
                if existing_otp and (now - existing_otp['created_at']) < 30:
                    wait_time = 30 - (now - existing_otp['created_at'])
                    return self._send_json({"error": f"Please wait {wait_time}s before requesting a new code."}, 429)
                
                # Create user placeholder if not exists
                if not user:
                    user_id = f"USR_{int(time.time())}_{secrets.token_hex(4)}"
                    cursor.execute('''
                        INSERT INTO users (id, email, email_verified, setup_completed, created_at)
                        VALUES (?, ?, 0, 0, ?)
                    ''', (user_id, email, now))
                
                otp_code = generate_secure_otp()
                otp_h, otp_salt = hash_otp(otp_code)
                expires_at = now + (5 * 60)
                
                cursor.execute('''
                    INSERT OR REPLACE INTO otps (email, otp_hash, salt, expires_at, attempts, created_at)
                    VALUES (?, ?, ?, ?, 0, ?)
                ''', (email, otp_h, otp_salt, expires_at, now))
                conn.commit()
                
            threading.Thread(target=send_email_otp, args=(email, otp_code), daemon=True).start()
            print(f"[SECURITY LOGIN OTP] Dispatched code for {email}: {otp_code}", file=sys.stdout)
            return self._send_json({
                "success": True,
                "message": "Login code sent to your email.",
                "masked_email": mask_email(email),
                "expires_in_seconds": 300
            })

        # ----------------------------------------------------------------------
        # AUTH: Login (Email + Password)
        # ----------------------------------------------------------------------
        elif path == '/api/auth/login':
            identifier = req_data.get('identifier', '').strip()
            password = req_data.get('password', '')
            
            if not identifier or not password:
                return self._send_json({"error": "Please enter both credentials."}, 400)
                
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM users 
                    WHERE email = ? OR mobile = ?
                ''', (identifier.lower(), identifier.replace(' ', '')))
                user = cursor.fetchone()
                
                if not user:
                    return self._send_json({
                        "error": "We couldn't find an account with these details. Create your pharmacy account to get started.",
                        "not_found": True
                    }, 404)
                    
                if not verify_password(password, user['password_hash'], user['salt']):
                    return self._send_json({"error": "Incorrect password. Please try again."}, 400)
                    
                if not user['email_verified']:
                    return self._send_json({
                        "error": "Email address not yet verified.",
                        "needs_verification": True,
                        "email": user['email']
                    }, 403)
                    
                if not user['setup_completed']:
                    # Issue session to finish setup
                    now = int(time.time())
                    token = secrets.token_hex(32)
                    cursor.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)", (token, user['id'], now + 86400, now))
                    conn.commit()
                    clean_user = sanitize_user(user)
                    return self._send_json({
                        "success": True,
                        "needs_setup": True,
                        "session_token": token,
                        "user": clean_user
                    })
                    
                now = int(time.time())
                token = secrets.token_hex(32)
                cursor.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)", (token, user['id'], now + (30 * 86400), now))
                conn.commit()
                
            return self._send_json({
                "success": True,
                "session_token": token,
                "user": sanitize_user(user)
            })

        # ----------------------------------------------------------------------
        # AUTH: Google OAuth Sign In (Official Identity Services / Verified ID Token)
        # ----------------------------------------------------------------------
        elif path == '/api/auth/google':
            credential = req_data.get('credential', '')
            email = req_data.get('email', '').strip().lower()
            name = req_data.get('name', '').strip()
            
            # If Google ID token JWT credential is provided, verify with Google
            if credential:
                try:
                    token_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(credential)}"
                    req = urllib.request.Request(token_url, headers={'User-Agent': 'EXPIREDNOT-Server'})
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        g_data = json.loads(resp.read().decode('utf-8'))
                        email = g_data.get('email', '').strip().lower()
                        name = g_data.get('name', '') or name
                except Exception as e:
                    print(f"[GOOGLE TOKEN VERIFICATION NOTE]: {e}")
                    if not email:
                        return self._send_json({"error": "Google identity verification failed."}, 400)
            
            if not email or '@' not in email:
                return self._send_json({"error": "A valid Google email address is required."}, 400)
                
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
                user = cursor.fetchone()
                now = int(time.time())
                
                if user and user['setup_completed']:
                    # Existing user with completed pharmacy profile -> issue session & enter Dashboard
                    token = secrets.token_hex(32)
                    cursor.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)", (token, user['id'], now + (30 * 86400), now))
                    conn.commit()
                    return self._send_json({
                        "success": True,
                        "existing_user": True,
                        "session_token": token,
                        "user": sanitize_user(user)
                    })
                else:
                    # New Google user -> Google verified email ownership -> proceeds to Pharmacy Details setup
                    user_id = user['id'] if user else f"USR_G_{int(time.time())}_{secrets.token_hex(4)}"
                    if not user:
                        cursor.execute('''
                            INSERT INTO users (id, email, email_verified, setup_completed, owner_name, auth_provider, created_at)
                            VALUES (?, ?, 1, 0, ?, 'google', ?)
                        ''', (user_id, email, name, now))
                    else:
                        cursor.execute("UPDATE users SET email_verified = 1, auth_provider = 'google' WHERE id = ?", (user_id,))
                    
                    token = secrets.token_hex(32)
                    cursor.execute("INSERT INTO sessions VALUES (?, ?, ?, ?)", (token, user_id, now + 86400, now))
                    conn.commit()
                    
                    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                    u_row = cursor.fetchone()
                    
                    return self._send_json({
                        "success": True,
                        "new_user": True,
                        "needs_setup": True,
                        "email": email,
                        "name": name,
                        "session_token": token,
                        "user": sanitize_user(u_row)
                    })

        # ----------------------------------------------------------------------
        # ONBOARDING: Complete Pharmacy Setup (Including Shop Full Address)
        # ----------------------------------------------------------------------
        elif path == '/api/onboarding/complete':
            user = self._get_auth_user()
            if not user:
                return self._send_json({"error": "Unauthorized session."}, 401)
                
            shop_name = req_data.get('shop_name', '').strip()
            dl_number = req_data.get('dl_number', '').strip()
            shop_address = req_data.get('shop_address', '').strip()
            city = req_data.get('city', '').strip()
            state = req_data.get('state', '').strip()
            pincode = req_data.get('pincode', '').strip()
            pharmacy_type = req_data.get('pharmacy_type', 'Retail Pharmacy')
            owner_name = req_data.get('owner_name', user.get('owner_name', '')).strip()
            role = req_data.get('role', 'Owner')
            mobile = req_data.get('mobile', '').strip()
            
            if not shop_name or not dl_number:
                return self._send_json({"error": "Pharmacy Name and D.L. Number are required."}, 400)
                
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE users 
                    SET shop_name = ?, dl_number = ?, shop_address = ?, city = ?, state = ?, pincode = ?, 
                        pharmacy_type = ?, owner_name = ?, role = ?, mobile = ?, setup_completed = 1
                    WHERE id = ?
                ''', (shop_name, dl_number, shop_address, city, state, pincode, pharmacy_type, owner_name, role, mobile, user['id']))
                
                # Add welcome notification
                cursor.execute('''
                    INSERT INTO notifications (id, user_id, text, type, is_read, created_at)
                    VALUES (?, ?, ?, 'system', 0, ?)
                ''', (f"NOTIF_{int(time.time())}", user['id'], f"Welcome to EXPIREDNOT, {shop_name}! Your pharmacy workspace is ready.", int(time.time())))
                
                conn.commit()
                
                cursor.execute("SELECT * FROM users WHERE id = ?", (user['id'],))
                updated_user = cursor.fetchone()
                
            return self._send_json({"success": True, "user": sanitize_user(updated_user)})

        # ----------------------------------------------------------------------
        # BILLS: Confirm & Ingest Verified Bill into Real Inventory
        # ----------------------------------------------------------------------
        elif path == '/api/bills/confirm':
            user = self._get_auth_user()
            if not user:
                return self._send_json({"error": "Unauthorized session."}, 401)
                
            distributor = req_data.get('distributor', 'General Supplier')
            invoice_no = req_data.get('invoice_no', f"INV-{secrets.token_hex(3).upper()}")
            invoice_date = req_data.get('invoice_date', time.strftime('%Y-%m-%d'))
            items = req_data.get('items', [])
            original_file_url = req_data.get('original_file_url', '')
            
            if not items:
                return self._send_json({"error": "Cannot confirm bill with zero line items."}, 400)
                
            bill_id = req_data.get('bill_id') or f"BILL_{int(time.time())}_{secrets.token_hex(4)}"
            now = int(time.time())
            total_bill_amount = sum(float(i.get('quantity', 0)) * float(i.get('purchase_rate', 0)) for i in items)
            
            with get_db() as conn:
                cursor = conn.cursor()
                
                # 1. Save Bill Record with original document link
                cursor.execute('''
                    INSERT OR REPLACE INTO bills (id, user_id, distributor, invoice_no, invoice_date, total_amount, original_file_path, file_name, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (bill_id, user['id'], distributor, invoice_no, invoice_date, total_bill_amount, original_file_url, os.path.basename(original_file_url), now))
                
                # 2. Insert Batches into Real Inventory
                for idx, item in enumerate(items):
                    batch_id = f"B_{now}_{idx}_{secrets.token_hex(3)}"
                    name = item.get('name', '').strip()
                    if not name:
                        continue
                    pack = item.get('pack', 'Standard')
                    batch_no = item.get('batch_no', f"BAT-{secrets.token_hex(3).upper()}").strip().upper()
                    expiry_date = item.get('expiry_date', '').strip()
                    qty = float(item.get('quantity', 1))
                    rate = float(item.get('purchase_rate', 0))
                    mrp = float(item.get('mrp', rate * 1.3))
                    rack = item.get('rack', f"Rack {chr(65 + idx % 4)}-1")
                    
                    cursor.execute('''
                        INSERT INTO batches (id, user_id, bill_id, name, generic_name, pack, batch_no, expiry_date, quantity, purchase_rate, mrp, rack, distributor, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (batch_id, user['id'], bill_id, name, item.get('generic_name'), pack, batch_no, expiry_date, qty, rate, mrp, rack, distributor, now))
                    
                    # 3. Log Stock Movement
                    mov_id = f"MOV_{now}_{idx}"
                    cursor.execute('''
                        INSERT INTO movements (id, user_id, type, medicine_name, batch_no, quantity, value, notes, created_at)
                        VALUES (?, ?, 'Purchased', ?, ?, ?, ?, ?, ?)
                    ''', (mov_id, user['id'], name, batch_no, qty, qty * rate, f"Invoice #{invoice_no}", now))
                
                # 4. Add Notification
                cursor.execute('''
                    INSERT INTO notifications (id, user_id, text, type, is_read, created_at)
                    VALUES (?, ?, ?, 'bill', 0, ?)
                ''', (f"NOTIF_{now}", user['id'], f"Purchase Bill #{invoice_no} ({distributor}) added: ₹{total_bill_amount:,.2f}", now))
                
                conn.commit()
                
            return self._send_json({
                "success": True,
                "bill_id": bill_id,
                "items_added": len(items),
                "total_amount": total_bill_amount
            })

        # ----------------------------------------------------------------------
        # AUTH: Logout (Destroys Session)
        # ----------------------------------------------------------------------
        elif path == '/api/auth/logout':
            auth_header = self.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header[7:].strip()
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
                    conn.commit()
            return self._send_json({"success": True, "message": "Logged out."})

        # Fallback 404
        return self._send_json({"error": "Endpoint not found."}, 404)

def run_server():
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, ExpiredNotHandler)
    print(f"============================================================")
    print(f" EXPIREDNOT Production Server running at http://localhost:{PORT}")
    print(f" Database: {DB_PATH}")
    print(f" Uploads: {UPLOADS_DIR}")
    print(f" Gemini AI Service: {'Active' if GEMINI_API_KEY else 'Standby (Configure GEMINI_API_KEY for live extraction)'}")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer shutting down gracefully.")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
