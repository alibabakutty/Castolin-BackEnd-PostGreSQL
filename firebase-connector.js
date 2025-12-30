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

app.put("/orders-by-number/:order_no", async (req, res) => {
  const { order_no } = req.params;
  const allItems = [...req.body].sort((a, b) => (a.id || 0) - (b.id || 0));

  if (!order_no || order_no.trim() === "") {
    return res.status(400).json({ error: "Order Number is required" });
  }

  if (!Array.isArray(allItems) || allItems.length === 0) {
    return res.status(400).json({ error: "No data provided" });
  }

  console.log(`🔧 Processing order_no: ${order_no}`);
  console.log(`📋 Total items received: ${allItems.length}`);

  // Separate items based on presence of id
  const itemsToInsert = allItems.filter(item => !item.id && !item._deleted); // New rows (no ID and not marked for deletion)
  const itemsToUpdate = allItems.filter(item => item.id && !item._deleted); // Existing rows with an ID (not deleted)
  const itemsToDelete = allItems.filter(item => item._deleted && item.id); // Existing rows marked for deletion

  console.log(`➕ Items to insert: ${itemsToInsert.length}`);
  console.log(`📝 Items to update: ${itemsToUpdate.length}`);
  console.log(`🗑️ Items to delete: ${itemsToDelete.length}`);

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if order exists (optional, depending on your requirements)
    const orderCheck = await client.query(
      'SELECT COUNT(*) as count FROM orders WHERE order_no = $1',
      [order_no]
    );
    
    const orderExists = parseInt(orderCheck.rows[0].count) > 0;
    
    // If order doesn't exist and no items to insert, throw error
    if (!orderExists && itemsToInsert.length === 0) {
      throw new Error(`Order ${order_no} does not exist and no new items provided`);
    }

    // Extract common order details with better logic
    const defaultOrderDetails = {
      voucher_type: 'Sales Order',
      order_date: new Date().toISOString().split('T')[0],
      customer_code: '',
      customer_name: '',
      executive: '',
      role: '',
      status: 'pending',
      total_quantity: 0,
      total_amount: 0,
      total_amount_without_tax: 0,
      total_sgst_amount: 0,
      total_cgst_amount: 0,
      total_igst_amount: 0,
      remarks: '',
    };

    // Find valid items to extract common details
    const validItems = allItems.filter(item => !item._deleted);
    let commonOrderDetails = { ...defaultOrderDetails };

    if (validItems.length > 0) {
      // Prioritize existing items (with IDs) for common details
      const priorityItem = validItems.find(item => item.id) || validItems[0];
      
      // Extract only the fields that should be common across all items
      const commonFields = [
        'voucher_type', 'order_date', 'customer_code', 'customer_name',
        'executive', 'role', 'status', 'total_quantity', 'total_amount',
        'total_amount_without_tax', 'total_sgst_amount', 'total_cgst_amount',
        'total_igst_amount', 'remarks'
      ];
      
      commonFields.forEach(field => {
        if (priorityItem[field] !== undefined) {
          commonOrderDetails[field] = priorityItem[field];
        }
      });
    }

    // Handle deletions first (with validation)
    if (itemsToDelete.length > 0) {
      const deleteIds = itemsToDelete.map(item => item.id);
      
      // Verify all items to delete belong to this order
      if (orderExists) {
        const verifySql = `
          SELECT id FROM orders 
          WHERE id = ANY($1::int[]) 
          AND order_no = $2`;
        
        const verifyResult = await client.query(verifySql, [deleteIds, order_no]);
        
        if (verifyResult.rows.length !== deleteIds.length) {
          const foundIds = verifyResult.rows.map(r => r.id);
          const missingIds = deleteIds.filter(id => !foundIds.includes(id));
          throw new Error(`Cannot delete items: ${missingIds.join(', ')} - they do not belong to order ${order_no}`);
        }
      }

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
      const allowedFields = [
        "status", "disc_percentage", "disc_amount", "spl_disc_percentage", 
        "spl_disc_amount", "net_rate", "gross_amount", "total_quantity", 
        "total_amount", "total_amount_without_tax", "remarks", "quantity", 
        "delivery_date", "delivery_mode", "transporter_name", 
        "total_sgst_amount", "total_cgst_amount", "total_igst_amount", 
        "sgst", "cgst", "igst", "gst", "hsn", "rate", "amount", "uom",
        "item_code", "item_name", "order_date"
      ];

      for (const [index, update] of itemsToUpdate.entries()) {
        const { id, _deleted, ...fields } = update;

        // Validate this item belongs to the order
        if (orderExists) {
          const itemCheck = await client.query(
            'SELECT order_no FROM orders WHERE id = $1',
            [id]
          );
          
          if (itemCheck.rows.length === 0) {
            throw new Error(`Item with ID ${id} does not exist`);
          }
          
          if (itemCheck.rows[0].order_no !== order_no) {
            throw new Error(`Item ${id} belongs to order ${itemCheck.rows[0].order_no}, not ${order_no}`);
          }
        }

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

        const setClause = Object.keys(filteredFields)
          .map((field, idx) => `${field} = $${idx + 1}`)
          .join(", ");

        const values = Object.values(filteredFields);
        values.push(id);
        values.push(order_no);

        const sql = `
          UPDATE orders 
          SET ${setClause} 
          WHERE id = $${values.length - 1} 
          AND order_no = $${values.length}`;
        
        const result = await client.query(sql, values);
        
        if (result.rowCount === 0) {
          throw new Error(`No record found for id ${id} in order ${order_no}`);
        }
        
        console.log(`✅ Successfully updated order item ${id}`);
      }
    }

    // Handle insertions (new rows)
    if (itemsToInsert.length > 0) {
      console.log(`➕ Inserting ${itemsToInsert.length} new items into order ${order_no}`);
      
      // Prepare batch insert data
      const insertData = [];
      
      for (const newItem of itemsToInsert) {
        // Don't include id for new items
        const { id, _deleted, ...cleanNewItem } = newItem;
        
        const insertItem = {
          order_no: order_no,
          voucher_type: commonOrderDetails.voucher_type,
          order_date: commonOrderDetails.order_date,
          customer_code: commonOrderDetails.customer_code,
          customer_name: commonOrderDetails.customer_name,
          executive: commonOrderDetails.executive,
          role: commonOrderDetails.role,
          status: commonOrderDetails.status,
          item_code: cleanNewItem.item_code || '',
          item_name: cleanNewItem.item_name || '',
          hsn: cleanNewItem.hsn || '',
          gst: cleanNewItem.gst || 0,
          sgst: cleanNewItem.sgst || 0,
          cgst: cleanNewItem.cgst || 0,
          igst: cleanNewItem.igst || 0,
          delivery_date: cleanNewItem.delivery_date || null,
          delivery_mode: cleanNewItem.delivery_mode || '',
          quantity: cleanNewItem.quantity || 0,
          uom: cleanNewItem.uom || '',
          rate: cleanNewItem.rate || 0,
          amount: cleanNewItem.amount || 0,
          net_rate: cleanNewItem.net_rate || 0,
          gross_amount: cleanNewItem.gross_amount || 0,
          disc_percentage: cleanNewItem.disc_percentage || 0,
          disc_amount: cleanNewItem.disc_amount || 0,
          spl_disc_percentage: cleanNewItem.spl_disc_percentage || 0,
          spl_disc_amount: cleanNewItem.spl_disc_amount || 0,
          total_quantity: commonOrderDetails.total_quantity,
          total_amount: commonOrderDetails.total_amount,
          total_amount_without_tax: commonOrderDetails.total_amount_without_tax,
          total_sgst_amount: commonOrderDetails.total_sgst_amount,
          total_cgst_amount: commonOrderDetails.total_cgst_amount,
          total_igst_amount: commonOrderDetails.total_igst_amount,
          remarks: commonOrderDetails.remarks,
          transporter_name: cleanNewItem.transporter_name || '',
        };
        
        insertData.push(insertItem);
      }

      // Insert items one by one (for better error tracking)
      const insertedIds = [];
      for (const [index, insertItem] of insertData.entries()) {
        try {
          const insertFields = Object.keys(insertItem);
          const insertValues = Object.values(insertItem);
          const placeholders = insertFields.map((_, idx) => `$${idx + 1}`).join(', ');
          
          const insertSql = `
            INSERT INTO orders (${insertFields.join(', ')})
            VALUES (${placeholders})
            RETURNING id, item_name`;

          const result = await client.query(insertSql, insertValues);
          insertedIds.push(result.rows[0].id);
          console.log(`✅ Inserted new item: ${result.rows[0].item_name} (ID: ${result.rows[0].id})`);
        } catch (insertError) {
          console.error(`❌ Failed to insert item ${index}:`, insertError);
          throw new Error(`Failed to insert new item at index ${index}: ${insertError.message}`);
        }
      }
    }

    // Update common order details on ALL rows (only if there are existing rows)
    if (orderExists || itemsToInsert.length > 0) {
      const updateCommonSql = `
        UPDATE orders 
        SET 
          voucher_type = $1,
          order_date = $2,
          customer_code = $3,
          customer_name = $4,
          executive = $5,
          role = $6,
          status = $7,
          total_quantity = $8,
          total_amount = $9,
          total_amount_without_tax = $10,
          total_sgst_amount = $11,
          total_cgst_amount = $12,
          total_igst_amount = $13,
          remarks = $14
        WHERE order_no = $15`;

      const commonValues = [
        commonOrderDetails.voucher_type,
        commonOrderDetails.order_date,
        commonOrderDetails.customer_code,
        commonOrderDetails.customer_name,
        commonOrderDetails.executive,
        commonOrderDetails.role,
        commonOrderDetails.status,
        commonOrderDetails.total_quantity,
        commonOrderDetails.total_amount,
        commonOrderDetails.total_amount_without_tax,
        commonOrderDetails.total_sgst_amount,
        commonOrderDetails.total_cgst_amount,
        commonOrderDetails.total_igst_amount,
        commonOrderDetails.remarks,
        order_no
      ];

      const updateResult = await client.query(updateCommonSql, commonValues);
      console.log(`📊 Updated common order details for ${updateResult.rowCount} rows in order ${order_no}`);
    }

    await client.query('COMMIT');
    
    // Get the updated order data to return
    const finalResult = await client.query(
      'SELECT * FROM orders WHERE order_no = $1 ORDER BY id',
      [order_no]
    );

    console.log(`✅ Successfully processed order ${order_no}`);
    console.log(`   Total rows in order: ${finalResult.rows.length}`);

    res.json({
      success: true,
      message: `Order ${order_no} updated successfully`,
      data: finalResult.rows,
      operations: {
        inserted: itemsToInsert.length,
        updated: itemsToUpdate.length,
        deleted: itemsToDelete.length,
        total: finalResult.rows.length
      },
      order_details: {
        order_no: order_no,
        customer_name: commonOrderDetails.customer_name,
        total_amount: commonOrderDetails.total_amount,
        status: commonOrderDetails.status
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Transaction failed for order:', order_no, error);
    res.status(500).json({
      success: false,
      error: 'Database operation failed',
      message: error.message,
      order_no: order_no,
      timestamp: new Date().toISOString()
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