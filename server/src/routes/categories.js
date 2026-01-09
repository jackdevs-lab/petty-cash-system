const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Get all categories in hierarchical format
router.get('/', async (req, res, next) => {
  try {
    const categories = await db.all(`
      SELECT 
        c.id,
        c.parent_id,
        c.name,
        c.is_system_category,
        p.name as parent_name,
        (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) 
        as child_count
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      ORDER BY 
        CASE WHEN c.parent_id IS NULL THEN c.id ELSE c.parent_id END,
        c.parent_id,
        c.name
    `);
    
    // Format into tree structure
    const categoryTree = [];
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.id] = {
        ...cat,
        children: []
      };
      
      if (!cat.parent_id) {
        categoryTree.push(categoryMap[cat.id]);
      }
    });
    
    // Second pass: Assign children to parents
    categories.forEach(cat => {
      if (cat.parent_id && categoryMap[cat.parent_id]) {
        categoryMap[cat.parent_id].children.push(categoryMap[cat.id]);
      }
    });
    
    res.json({ categories: categoryTree });
  } catch (error) {
    next(error);
  }
});

// Get categories for dropdown (flattened with indentation)
router.get('/dropdown', async (req, res, next) => {
  try {
    const categories = await db.all(`
      WITH RECURSIVE category_tree AS (
        SELECT 
          id,
          parent_id,
          name,
          is_system_category,
          0 as level,
          CAST(id AS TEXT) as path
        FROM categories
        WHERE parent_id IS NULL
        
        UNION ALL
        
        SELECT 
          c.id,
          c.parent_id,
          c.name,
          c.is_system_category,
          ct.level + 1,
          ct.path || '|' || c.id
        FROM categories c
        JOIN category_tree ct ON c.parent_id = ct.id
      )
      SELECT 
        id,
        parent_id,
        CASE 
          WHEN level = 0 THEN name
          WHEN level = 1 THEN ' └─ ' || name
          ELSE replace(substr(quote(zeroblob(((level - 1) + 1) / 2)), 3, level - 1), '0', ' ') || ' └─ ' || name
        END as display_name,
        name,
        level,
        is_system_category
      FROM category_tree
      WHERE is_system_category = 0  -- Exclude system categories from dropdown
      ORDER BY path
    `);
    
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

// Get category usage statistics
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await db.all(`
      SELECT 
        c.id,
        c.name,
        c.parent_id,
        p.name as parent_name,
        COALESCE(SUM(ts.amount), 0) as total_amount,
        COUNT(ts.id) as transaction_count
      FROM categories c
      LEFT JOIN transaction_splits ts ON c.id = ts.category_id
      LEFT JOIN transactions t ON ts.transaction_id = t.id AND t.status = 'LOCKED'
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.is_system_category = 0
      GROUP BY c.id, c.name, c.parent_id, p.name
      ORDER BY total_amount DESC
    `);
    
    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

module.exports = router;