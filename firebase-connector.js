import express from "express";
import pkg from "pg";
import cors from "cors";
import admin from 'firebase-admin';
import serviceAccount from "./config/serviceAccountKey.json" with { type: "json" }; 

const app = express(); 

// ✅ PROPER CORS CONFIGURATION FOR RAILWAY
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://castolin-frontend-production.up.railway.app',
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // React dev server
      process.env.CLIENT_URL, // From environment variable
    ].filter(Boolean); // Remove any undefined values

    // Check if the origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  optionsSuccessStatus: 200
};
// Apply CORS middleware
app.use(cors(corsOptions));
app.use(express.json());

// ✅ POSTGRES CONFIGURATION FOR RAILWAY
const pool = new pkg.Pool({
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "Rup@@.123$",
  database: process.env.PGDATABASE || "order_management",
  port: process.env.PGPORT || 5432,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ PostgreSQL connection failed:", err);
  } else {
    console.log("✅ Connected to PostgreSQL Database");
    release();
  }
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(401).json({ error: "Invalid token" });
  }
};

// ✅ HEALTH CHECK ENDPOINT (IMPORTANT FOR RAILWAY)
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Backend is running successfully',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cors: {
      allowedOrigins: corsOptions.origin.toString()
    }
  });
});

// ✅ DATABASE HEALTH CHECK
app.get("/api/health/db", async (req, res) => {
  try {
    const result = await pool.query('SELECT 1 as test');
    res.json({
      status: 'OK',
      database: 'Connected successfully',
      test: result.rows[0].test
    });
  } catch (err) {
    console.error('Database health check failed:', err);
    return res.status(500).json({
      status: 'ERROR',
      database: 'Connection failed',
      error: err.message
    });
  }
});

app.get("/me-admin", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT role FROM admins WHERE firebase_uid = $1",
      [req.uid]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/me-distributor", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT customer_code, customer_name, role, state FROM customer WHERE firebase_uid = $1",
      [req.uid]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/me-corporate", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT customer_code, customer_name, role, state FROM customer WHERE firebase_uid = $1",
      [req.uid]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/distributors/:customer_code", async (req, res) => {
  const customerCode = req.params.customer_code;
  const updates = req.body;

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No update data provided" });
  }

  const allowedFields = ['customer_name', 'mobile_number', 'email', 'customer_type', 'password', 'role', 'status', 'firebase_uid'];
  
  const filteredUpdates = {};
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  if (Object.keys(filteredUpdates).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const setClause = Object.keys(filteredUpdates)
    .map((key, index) => `${key} = $${index + 1}`)
    .join(', ');

  const values = Object.values(filteredUpdates);
  values.push(customerCode);

  const sql = `UPDATE customer SET ${setClause} WHERE customer_code = $${values.length}`;

  try {
    const result = await pool.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Distributor not found" });
    }
    res.json({ 
      message: "Distributor updated successfully", 
      affectedRows: result.rowCount 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/corporates/:customer_code", async (req, res) => {
  const customerCode = req.params.customer_code;
  const updates = req.body;

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No update data provided" });
  }

  const allowedFields = ['customer_name', 'mobile_number', 'email', 'customer_type', 'password', 'role', 'status', 'firebase_uid'];
  
  const filteredUpdates = {};
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  if (Object.keys(filteredUpdates).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const setClause = Object.keys(filteredUpdates)
    .map((key, index) => `${key} = $${index + 1}`)
    .join(', ');

  const values = Object.values(filteredUpdates);
  values.push(customerCode);

  const sql = `UPDATE customer SET ${setClause} WHERE customer_code = $${values.length}`;

  try {
    const result = await pool.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Direct Order not found" });
    }
    res.json({ 
      message: "Direct Order updated successfully", 
      affectedRows: result.rowCount 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin signup (only for admins table)
app.post("/signup-admin", verifyToken, async (req, res) => {
  const { username, email, mobile_number } = req.body;
  const firebaseUid = req.uid;

  console.log("Admin signup request:", { username, email, firebaseUid });

  if (!username || !email) {
    return res.status(400).json({ 
      success: false,
      error: "Username and email are required" 
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false,
      error: "Invalid email format" 
    });
  }

  try {
    const checkResult = await pool.query(
      "SELECT * FROM admins WHERE firebase_uid = $1 OR email = $2",
      [firebaseUid, email]
    );

    if (checkResult.rows.length > 0) {
      const existingAdmin = checkResult.rows[0];
      return res.status(200).json({ 
        success: true,
        message: "Admin already exists", 
        role: existingAdmin.role,
        userType: "admin"
      });
    }

    const insertSql = `
      INSERT INTO admins (username, email, firebase_uid, role, mobile_number)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const role = "admin";

    const insertResult = await pool.query(
      insertSql, 
      [username, email, firebaseUid, role, mobile_number || null]
    );

    console.log("New admin added to PostgreSQL, ID:", insertResult.rows[0].id);
    res.status(201).json({ 
      success: true,
      message: "Admin signup successful", 
      role,
      userType: "admin",
      userId: insertResult.rows[0].id
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Admin login (checks only admins table)
app.post("/login-admin", verifyToken, async (req, res) => {
  const firebaseUid = req.uid;

  try {
    const result = await pool.query(
      "SELECT id, username, mobile_number, email, role, firebase_uid FROM admins WHERE firebase_uid = $1",
      [firebaseUid]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Admin not found. Please sign up first." 
      });
    }

    const admin = result.rows[0];
    res.json({
      success: true,
      message: "Admin login successful",
      user: admin,
      userType: 'admin'
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ 
      success: false,
      error: "Internal server error" 
    });
  }
});

// Get specific distributor by usercode
app.get("/distributors/:customer_code", async (req, res) => {
  const { customer_code } = req.params;

  if (!customer_code) {
    return res.status(400).json({ error: "Distributor usercode is required" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM customer WHERE customer_code = $1",
      [customer_code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Distributor not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get specific corporate by id
app.get("/corporates/:customer_code", async (req, res) => {
  const { customer_code } = req.params;

  if (!customer_code) {
    return res.status(400).json({ error: "Customer Code is required!" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM customer WHERE customer_code = $1",
      [customer_code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Direct Order not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/stock_item", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM stock_item");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/customer", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM customer");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/admins", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM admins");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/distributors", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM customer WHERE customer_type = 'distributor'`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/corporates", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM customer WHERE customer_type = 'direct'`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/orders", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific stock item by item code
app.get("/stock_item/:item_code", async (req, res) => {
  const { item_code } = req.params;

  if (!item_code) {
    return res.status(400).json({ error: "Stock Item Code is required" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM stock_item WHERE item_code = $1",
      [item_code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Stock item not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get specific customer by customer_code only
app.get("/customer/:customer_code", async (req, res) => {
  const { customer_code } = req.params;

  if (!customer_code) {
    return res.status(400).json({ error: "Customer code is required" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM customer WHERE customer_code = $1",
      [customer_code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get specific admin by id
app.get("/admins/:id", async (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ error: "Admin ID is required" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM admins WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Admin not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// get specific order by id
app.get("/orders/:id", async (req, res) => {
  const orderId = req.params.id;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID is required" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE id = $1",
      [orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// get all orders by order number (optionally filter by created_at)
app.get("/orders-by-number/:order_no", async (req, res) => {
  const { order_no } = req.params;
  const { created_at } = req.query; // optional filter

  if (!order_no) {
    return res.status(400).json({ error: "Order Number is required" });
  }

  let sql = "SELECT * FROM orders WHERE order_no = $1";
  const params = [order_no];

  // Optional created_at filter
  if (created_at) {
    sql += " AND created_at = $2";
    params.push(created_at);
  }

  try {
    const result = await pool.query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No orders found" });
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Database query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/api/orders/next-order-number', async (req, res) => {
  try {
    // Get the latest order number from database
    const latestOrder = await Order.findOne({
      order_no: { $regex: /^SQ-/ }
    }).sort({ createdAt: -1 });
    
    let nextSequence = '0001';
    const today = new Date();
    const day = today.getDate().toString().padStart(2, '0');
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const year = today.getFullYear().toString().slice(-2);
    
    if (latestOrder && latestOrder.order_no) {
      const parts = latestOrder.order_no.split('-');
      const lastDate = `${parts[1]}-${parts[2]}-${parts[3]}`;
      const currentDate = `${day}-${month}-${year}`;
      
      if (lastDate === currentDate) {
        const lastSequence = parseInt(parts[4]);
        nextSequence = (lastSequence + 1).toString().padStart(4, '0');
      }
    }
    
    res.json({ 
      orderNumber: `SQ-${day}-${month}-${year}-${nextSequence}` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/orders', async (req, res) => {
  const data = req.body;

  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: "No orders provided" });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const insertPromises = data.map(item => {
      const insertSql = `
        INSERT INTO orders 
        (voucher_type, order_no, order_date, status, customer_code, executive, role, customer_name, item_code, item_name, hsn, gst, sgst, cgst, igst, delivery_date, delivery_mode, transporter_name, quantity, uom, rate, amount, net_rate, gross_amount, disc_percentage, disc_amount, spl_disc_percentage, spl_disc_amount, total_quantity, total_amount_without_tax, total_cgst_amount, total_sgst_amount, total_igst_amount, total_amount, remarks) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
        RETURNING id
      `;
      
      return client.query(insertSql, [
        item.voucher_type,
        item.order_no,
        item.date,
        item.status,
        item.customer_code,
        item.executive,
        item.role,
        item.customer_name,
        item.item_code,
        item.item_name,
        item.hsn,
        String(item.gst).replace(/\s*%/, ''),
        item.sgst,
        item.cgst,
        item.igst,
        item.delivery_date,
        item.delivery_mode,
        item.transporter_name,
        item.quantity,
        item.uom,
        item.rate,
        item.amount,
        item.net_rate,
        item.gross_amount,
        item.disc_percentage,
        item.disc_amount,
        item.spl_disc_percentage,
        item.spl_disc_amount,
        item.total_quantity ?? 0.00,
        item.total_amount_without_tax ?? 0.00, // NEW: Add this
        item.total_cgst_amount ?? 0.00,
        item.total_sgst_amount ?? 0.00,
        item.total_igst_amount ?? 0.00,
        item.total_amount ?? 0.00,
        item.remarks ?? '',
      ]);
    });

    const results = await Promise.all(insertPromises);
    await client.query('COMMIT');
    
    res.json({ 
      message: "Orders inserted successfully", 
      insertedCount: results.length,
      ids: results.map(r => r.rows[0].id)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ✅ Update specific fields of orders by order number with deletion support
app.put("/orders-by-number/:order_no", async (req, res) => {
  const { order_no } = req.params;
  const updates = [...req.body].sort((a, b) => a.id - b.id);

  if (!order_no || order_no.trim() === "") {
    return res.status(400).json({ error: "Order Number is required" });
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: "No update data provided" });
  }

  // Debug: Log what we're receiving
  console.log(`🔧 Processing update for order_no: ${order_no}`);
  console.log(`📋 Total items received: ${updates.length}`);
  
  // Separate updates and deletions
  const itemsToUpdate = updates.filter(item => !item._deleted);
  const itemsToDelete = updates.filter(item => item._deleted && item.id);
  
  console.log(`📝 Items to update: ${itemsToUpdate.length}`);
  console.log(`🗑️ Items to delete: ${itemsToDelete.length}`);

  const validationErrors = [];
  updates.forEach((update, index) => {
    if (!update || typeof update !== "object") {
      validationErrors.push(`Update ${index}: Invalid update object`);
      return;
    }

    // For deletions, only need id and _deleted flag
    if (update._deleted) {
      if (!update.id || isNaN(update.id)) {
        validationErrors.push(`Delete ${index}: Valid numeric Order ID is required`);
      }
      return; // Skip further validation for deletions
    }

    // For updates, validate all required fields
    if (!update.id || isNaN(update.id)) {
      validationErrors.push(`Update ${index}: Valid numeric Order ID is required`);
    }

    // Add total_amount_without_tax to numeric fields
    const numericFields = [
      "disc_percentage", "disc_amount", "spl_disc_percentage", "spl_disc_amount",
      "net_rate", "gross_amount", "total_quantity", "total_amount", "quantity",
      "total_sgst_amount", "total_cgst_amount", "total_igst_amount",
      "total_amount_without_tax", "sgst", "cgst", "igst", "gst"
    ];

    numericFields.forEach((field) => {
      if (update[field] !== undefined && isNaN(update[field])) {
        validationErrors.push(`Update ${index}: ${field} must be a number`);
      }
    });

    if (update.gst !== undefined && (update.gst < 0 || update.gst > 100)) {
      validationErrors.push(`Update ${index}: gst must be between 0 and 100`);
    }
  });

  if (validationErrors.length > 0) {
    return res.status(400).json({
      error: "Validation failed",
      details: validationErrors,
    });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // First, verify all IDs belong to the same order number
    const allOrderIds = updates.map(u => u.id);
    const verifySql = `
      SELECT id, order_no 
      FROM orders 
      WHERE id = ANY($1::int[]) 
      AND order_no = $2`;
    
    const verifyResult = await client.query(verifySql, [allOrderIds, order_no]);
    
    if (verifyResult.rows.length !== allOrderIds.length) {
      throw new Error(`Some order IDs do not belong to order number ${order_no} or do not exist`);
    }

    console.log(`✅ Verified ${verifyResult.rows.length} records belong to order ${order_no}`);

    // Handle deletions first
    if (itemsToDelete.length > 0) {
      const deleteIds = itemsToDelete.map(item => item.id);
      const deleteSql = `
        DELETE FROM orders 
        WHERE id = ANY($1::int[]) 
        AND order_no = $2 
        RETURNING id, item_name`;
      
      const deleteResult = await client.query(deleteSql, [deleteIds, order_no]);
      console.log(`🗑️ Successfully deleted ${deleteResult.rows.length} items:`, 
        deleteResult.rows.map(r => `${r.id} (${r.item_name})`));
    }

    // Handle updates
    if (itemsToUpdate.length > 0) {
      // Add total_amount_without_tax to allowed fields
      const allowedFields = [
        "status", "disc_percentage", "disc_amount", "spl_disc_percentage", 
        "spl_disc_amount", "net_rate", "gross_amount", "total_quantity", 
        "total_amount", "total_amount_without_tax", "remarks", "quantity", 
        "delivery_date", "delivery_mode", "transporter_name", 
        "total_sgst_amount", "total_cgst_amount", "total_igst_amount", 
        "sgst", "cgst", "igst", "gst", "hsn", "rate", "amount", "uom"
      ];

      for (const [index, update] of itemsToUpdate.entries()) {
        const { id, _deleted, ...fields } = update; // Remove _deleted flag

        // Filter fields to only allowed ones
        const filteredFields = {};
        for (const key of Object.keys(fields)) {
          if (allowedFields.includes(key)) {
            filteredFields[key] = fields[key];
          }
        }

        if (Object.keys(filteredFields).length === 0) {
          console.warn(`⚠️ Skipping update ${index} for ID ${id}: No valid fields`);
          continue;
        }

        // Build dynamic SET clause
        const setClause = Object.keys(filteredFields)
          .map((field, idx) => `${field} = $${idx + 1}`)
          .join(", ");

        const values = Object.values(filteredFields);
        // Add ID as the last parameter
        values.push(id);
        // Add order_no as second condition for safety
        values.push(order_no);

        // IMPORTANT: Update only where both ID matches AND order_no matches
        const sql = `
          UPDATE orders 
          SET ${setClause} 
          WHERE id = $${values.length - 1} 
          AND order_no = $${values.length}`;

        console.log(`🔄 Updating order item ${id} in order ${order_no}:`);
        console.log(`   SET Clause includes: ${Object.keys(filteredFields).join(', ')}`);
        
        const result = await client.query(sql, values);
        
        if (result.rowCount === 0) {
          console.error(`❌ No record found for id ${id} in order ${order_no}`);
          throw new Error(`No record found for id ${id} in order ${order_no}`);
        }
        
        console.log(`✅ Successfully updated order item ${id}`);
      }
    }

    await client.query('COMMIT');
    
    // Fetch updated records to return
    const fetchUpdatedSql = `
      SELECT * FROM orders 
      WHERE order_no = $1 
      ORDER BY id`;
    
    const updatedResult = await client.query(fetchUpdatedSql, [order_no]);
    
    res.json({
      message: "Orders processed successfully",
      updatedCount: itemsToUpdate.length,
      deletedCount: itemsToDelete.length,
      data: updatedResult.rows
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Transaction failed:", err.message);
    res.status(400).json({
      error: "Update failed",
      details: err.message,
    });
  } finally {
    client.release();
  }
});

// ✅ USE PORT FROM ENVIRONMENT VARIABLE (RAILWAY PROVIDES THIS)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});