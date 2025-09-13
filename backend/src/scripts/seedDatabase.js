import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Alert from '../models/Alert.js';
import ApiKey from '../models/ApiKey.js';
import { logger } from '../utils/logger.js';

dotenv.config();

const seedDatabase = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB for seeding');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Transaction.deleteMany({}),
      Alert.deleteMany({}),
      ApiKey.deleteMany({})
    ]);
    logger.info('Cleared existing data');

    // Create admin user
    const adminUser = await User.create({
      email: 'admin@fraudshield.com',
      password: 'password',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin'
    });

    // Create analyst user
    const analystUser = await User.create({
      email: 'analyst@fraudshield.com',
      password: 'password',
      firstName: 'John',
      lastName: 'Analyst',
      role: 'analyst'
    });

    logger.info('Created users');

    // Generate sample transactions
    const merchants = [
      { name: 'Amazon', category: 'E-commerce' },
      { name: 'Walmart', category: 'Retail' },
      { name: 'Shell Gas Station', category: 'Gas' },
      { name: 'McDonald\'s', category: 'Food' },
      { name: 'Chase ATM', category: 'ATM' },
      { name: 'PayPal', category: 'Online' }
    ];

    const locations = [
      { country: 'US', city: 'New York' },
      { country: 'US', city: 'Los Angeles' },
      { country: 'US', city: 'Chicago' },
      { country: 'CA', city: 'Toronto' },
      { country: 'UK', city: 'London' }
    ];

    const transactions = [];
    const alerts = [];

    for (let i = 0; i < 100; i++) {
      const merchant = merchants[Math.floor(Math.random() * merchants.length)];
      const location = locations[Math.floor(Math.random() * locations.length)];
      const amount = Math.floor(Math.random() * 5000) + 10;
      
      // Calculate fraud probability
      let fraudProbability = Math.random() * 100;
      
      // Increase probability for certain conditions
      if (amount > 2000) fraudProbability += 20;
      if (location.country !== 'US') fraudProbability += 15;
      if (merchant.category === 'ATM') fraudProbability += 10;
      
      fraudProbability = Math.min(fraudProbability, 100);
      
      const riskLevel = fraudProbability >= 80 ? 'high' : 
                       fraudProbability >= 50 ? 'medium' : 'low';
      const status = fraudProbability >= 90 ? 'fraud' :
                     fraudProbability >= 70 ? 'suspicious' : 'safe';

      const transaction = {
        transactionId: `TXN-${Date.now()}-${i.toString().padStart(3, '0')}`,
        amount,
        currency: 'USD',
        merchant: {
          name: merchant.name,
          category: merchant.category,
          location: location.city
        },
        user: {
          userId: `USER-${Math.floor(Math.random() * 1000)}`,
          email: `user${Math.floor(Math.random() * 100)}@example.com`,
          name: `User ${i}`
        },
        paymentMethod: {
          type: 'credit_card',
          last4: Math.floor(Math.random() * 9999).toString().padStart(4, '0'),
          brand: ['Visa', 'Mastercard', 'Amex'][Math.floor(Math.random() * 3)]
        },
        fraudAnalysis: {
          probability: Math.round(fraudProbability),
          riskLevel,
          status,
          factors: generateFraudFactors(amount, merchant, location),
          confidence: Math.random() * 0.3 + 0.7
        },
        location: {
          country: location.country,
          city: location.city,
          coordinates: {
            lat: Math.random() * 180 - 90,
            lng: Math.random() * 360 - 180
          },
          ipAddress: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
        },
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Last 30 days
      };

      transactions.push(transaction);

      // Create alerts for high-risk transactions
      if (fraudProbability > 70) {
        alerts.push({
          transactionId: transaction.transactionId,
          type: fraudProbability > 90 ? 'fraud_detected' : 'high_risk',
          severity: fraudProbability > 90 ? 'critical' : 'high',
          title: `${fraudProbability > 90 ? 'Fraud' : 'High Risk'} Transaction Detected`,
          description: `Transaction of $${amount} at ${merchant.name} flagged with ${Math.round(fraudProbability)}% fraud probability`,
          fraudProbability: Math.round(fraudProbability),
          amount,
          merchant: merchant.name,
          triggers: [
            {
              rule: 'amount_threshold',
              value: amount,
              threshold: 1000,
              description: amount > 1000 ? 'Amount exceeds threshold' : 'Normal amount'
            }
          ]
        });
      }
    }

    // Insert transactions
    const createdTransactions = await Transaction.insertMany(transactions);
    logger.info(`Created ${createdTransactions.length} transactions`);

    // Insert alerts with transaction references
    const alertsWithRefs = alerts.map(alert => {
      const transaction = createdTransactions.find(t => t.transactionId === alert.transactionId);
      return {
        ...alert,
        transaction: transaction._id
      };
    });

    const createdAlerts = await Alert.insertMany(alertsWithRefs);
    logger.info(`Created ${createdAlerts.length} alerts`);

    // Create sample API key for admin
    const salt = await bcrypt.genSalt(12);
    const hashedKey = await bcrypt.hash('sample-api-key-123', salt);

    await ApiKey.create({
      name: 'Sample API Key',
      hashedKey,
      owner: adminUser._id,
      permissions: ['read', 'write']
    });

    logger.info('Created sample API key');
    logger.info('Database seeding completed successfully!');

    process.exit(0);
  } catch (error) {
    logger.error('Seeding error:', error);
    process.exit(1);
  }
};

function generateFraudFactors(amount, merchant, location) {
  const factors = [];

  if (amount > 2000) {
    factors.push({
      factor: 'high_amount',
      weight: 0.3,
      description: 'Transaction amount is unusually high'
    });
  }

  if (merchant.category === 'ATM') {
    factors.push({
      factor: 'atm_transaction',
      weight: 0.2,
      description: 'ATM transactions have higher fraud risk'
    });
  }

  if (location.country !== 'US') {
    factors.push({
      factor: 'foreign_transaction',
      weight: 0.25,
      description: 'Transaction from foreign location'
    });
  }

  return factors;
}

seedDatabase();
