import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await hash('password123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@amroding.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@amroding.com',
      password: adminPassword,
      role: 'admin',
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // Create staff user
  const staffPassword = await hash('staff123', 12);
  const staff = await prisma.user.upsert({
    where: { email: 'staff@amroding.com' },
    update: {},
    create: {
      name: 'Staff Member',
      email: 'staff@amroding.com',
      password: staffPassword,
      role: 'staff',
    },
  });
  console.log('✅ Staff user created:', staff.email);

  // Create cashier user
  const cashierPassword = await hash('cashier123', 12);
  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@amroding.com' },
    update: {},
    create: {
      name: 'Cashier',
      email: 'cashier@amroding.com',
      password: cashierPassword,
      role: 'cashier',
    },
  });
  console.log('✅ Cashier user created:', cashier.email);

  // Create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Frozen Goods' },
      update: {},
      create: { name: 'Frozen Goods', description: 'Frozen food products including ice cream, frozen vegetables, and ready-to-cook items' },
    }),
    prisma.category.upsert({
      where: { name: 'Drinks' },
      update: {},
      create: { name: 'Drinks', description: 'Beverages including soft drinks, juices, water, and energy drinks' },
    }),
    prisma.category.upsert({
      where: { name: 'Canned Goods' },
      update: {},
      create: { name: 'Canned Goods', description: 'Canned food products including sardines, corned beef, and canned fruits' },
    }),
    prisma.category.upsert({
      where: { name: 'Meat Products' },
      update: {},
      create: { name: 'Meat Products', description: 'Fresh and processed meat products including chicken, pork, and beef' },
    }),
  ]);
  console.log('✅ Categories created:', categories.map(c => c.name).join(', '));

  

  // Create customers
  const customers = await Promise.all([
    prisma.customer.upsert({
      where: { id: 'customer-1' },
      update: {},
      create: {
        id: 'customer-1',
        name: 'Sari-Sari Store Ni Aling Nena',
        contactPerson: 'Nena Garcia',
        phone: '+63 920 111 2222',
        email: 'nena.garcia@email.com',
        address: 'Block 5, Lot 12, Brgy. San Antonio, Pasig City',
      },
    }),
    prisma.customer.upsert({
      where: { id: 'customer-2' },
      update: {},
      create: {
        id: 'customer-2',
        name: 'Quick Mart Convenience Store',
        contactPerson: 'Roberto Lim',
        phone: '+63 921 222 3333',
        email: 'quickmart@email.com',
        address: '234 Main Road, Taguig City, Metro Manila',
      },
    }),
    prisma.customer.upsert({
      where: { id: 'customer-3' },
      update: {},
      create: {
        id: 'customer-3',
        name: 'Sunshine Grocery',
        contactPerson: 'Ana Villanueva',
        phone: '+63 922 333 4444',
        email: 'sunshine.grocery@email.com',
        address: '567 Commonwealth Ave, Quezon City',
      },
    }),
    prisma.customer.upsert({
      where: { id: 'customer-4' },
      update: {},
      create: {
        id: 'customer-4',
        name: 'Mang Tony\'s Carinderia',
        contactPerson: 'Antonio Ramos',
        phone: '+63 923 444 5555',
        email: 'mangtony@email.com',
        address: '890 Rizal St, Mandaluyong City',
      },
    }),
    prisma.customer.upsert({
      where: { id: 'customer-5' },
      update: {},
      create: {
        id: 'customer-5',
        name: 'Fresh Choice Mini Mart',
        contactPerson: 'Lisa Tan',
        phone: '+63 924 555 6666',
        email: 'freshchoice@email.com',
        address: '321 Aurora Blvd, San Juan City',
      },
    }),
  ]);
  console.log('✅ Customers created:', customers.map(c => c.name).join(', '));

  // Create products
  const products = await Promise.all([
    // Frozen Goods
    prisma.product.upsert({
      where: { sku: 'FRO-CHI-001' },
      update: {},
      create: {
        name: 'Frozen Chicken Wings (1kg)',
        sku: 'FRO-CHI-001',
        costPrice: 220.00,
        stock: 150,
        minStock: 30,
        uoms: {
          create: [{
            name: 'pack',
            barcode: '4800000001001',
            price: 285.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2026-08-15'),
        categoryId: categories[0].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'FRO-POR-002' },
      update: {},
      create: {
        name: 'Frozen Pork Tocino (500g)',
        sku: 'FRO-POR-002',
        costPrice: 130.00,
        stock: 8,
        minStock: 20,
        uoms: {
          create: [{
            name: 'pack',
            barcode: '4800000001002',
            price: 175.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2026-07-20'),
        categoryId: categories[0].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'FRO-FIS-003' },
      update: {},
      create: {
        name: 'Frozen Bangus (Milkfish) 600g',
        sku: 'FRO-FIS-003',
        costPrice: 145.00,
        stock: 75,
        minStock: 15,
        uoms: {
          create: [{
            name: 'pack',
            barcode: '4800000001003',
            price: 195.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2026-09-10'),
        categoryId: categories[0].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'FRO-ICE-004' },
      update: {},
      create: {
        name: 'Selecta Ice Cream (1.5L)',
        sku: 'FRO-ICE-004',
        costPrice: 160.00,
        stock: 45,
        minStock: 10,
        uoms: {
          create: [{
            name: 'tub',
            barcode: '4800000001004',
            price: 210.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2026-12-01'),
        categoryId: categories[0].id,
      },
    }),
    // Drinks
    prisma.product.upsert({
      where: { sku: 'DRI-COK-001' },
      update: {},
      create: {
        name: 'Coca-Cola (1.5L)',
        sku: 'DRI-COK-001',
        costPrice: 52.00,
        stock: 200,
        minStock: 50,
        uoms: {
          create: [{
            name: 'bottle',
            barcode: '4800000002001',
            price: 68.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2027-03-15'),
        categoryId: categories[1].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'DRI-SPR-002' },
      update: {},
      create: {
        name: 'Sprite (1.5L)',
        sku: 'DRI-SPR-002',
        costPrice: 52.00,
        stock: 5,
        minStock: 50,
        uoms: {
          create: [{
            name: 'bottle',
            barcode: '4800000002002',
            price: 68.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2027-03-15'),
        categoryId: categories[1].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'DRI-ROY-003' },
      update: {},
      create: {
        name: 'Royal (500ml)',
        sku: 'DRI-ROY-003',
        costPrice: 18.00,
        stock: 300,
        minStock: 60,
        uoms: {
          create: [{
            name: 'bottle',
            barcode: '4800000002003',
            price: 25.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2027-02-28'),
        categoryId: categories[1].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'DRI-C2G-004' },
      update: {},
      create: {
        name: 'C2 Green Tea (500ml)',
        sku: 'DRI-C2G-004',
        costPrice: 22.00,
        stock: 180,
        minStock: 40,
        uoms: {
          create: [{
            name: 'bottle',
            barcode: '4800000002004',
            price: 30.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2027-01-10'),
        categoryId: categories[1].id,
      },
    }),
    // Canned Goods
    prisma.product.upsert({
      where: { sku: 'CAN-SAR-001' },
      update: {},
      create: {
        name: 'Mega Sardines in Tomato Sauce (155g)',
        sku: 'CAN-SAR-001',
        costPrice: 16.00,
        stock: 500,
        minStock: 100,
        uoms: {
          create: [{
            name: 'can',
            barcode: '4800000003001',
            price: 22.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2028-06-01'),
        categoryId: categories[2].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'CAN-COR-002' },
      update: {},
      create: {
        name: 'Palm Corned Beef (150g)',
        sku: 'CAN-COR-002',
        costPrice: 34.00,
        stock: 12,
        minStock: 50,
        uoms: {
          create: [{
            name: 'can',
            barcode: '4800000003002',
            price: 45.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2028-04-15'),
        categoryId: categories[2].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'CAN-TUN-003' },
      update: {},
      create: {
        name: 'Century Tuna Flakes (180g)',
        sku: 'CAN-TUN-003',
        costPrice: 28.00,
        stock: 250,
        minStock: 60,
        uoms: {
          create: [{
            name: 'can',
            barcode: '4800000003003',
            price: 38.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2028-08-20'),
        categoryId: categories[2].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'CAN-MEA-004' },
      update: {},
      create: {
        name: 'Argentina Meatloaf (170g)',
        sku: 'CAN-MEA-004',
        costPrice: 26.00,
        stock: 180,
        minStock: 40,
        uoms: {
          create: [{
            name: 'can',
            barcode: '4800000003004',
            price: 35.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2028-05-10'),
        categoryId: categories[2].id,
      },
    }),
    // Meat Products
    prisma.product.upsert({
      where: { sku: 'MEA-HOT-001' },
      update: {},
      create: {
        name: 'Purefoods Tender Juicy Hotdog (1kg)',
        sku: 'MEA-HOT-001',
        costPrice: 155.00,
        stock: 60,
        minStock: 15,
        uoms: {
          create: [{
            name: 'pack',
            barcode: '4800000004001',
            price: 198.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2026-07-05'),
        categoryId: categories[3].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'MEA-LON-002' },
      update: {},
      create: {
        name: 'CDO Longanisa (500g)',
        sku: 'MEA-LON-002',
        costPrice: 110.00,
        stock: 3,
        minStock: 20,
        uoms: {
          create: [{
            name: 'pack',
            barcode: '4800000004002',
            price: 145.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2026-06-25'),
        categoryId: categories[3].id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'MEA-HAM-003' },
      update: {},
      create: {
        name: 'Purefoods Honeycured Bacon (200g)',
        sku: 'MEA-HAM-003',
        costPrice: 125.00,
        stock: 40,
        minStock: 10,
        uoms: {
          create: [{
            name: 'pack',
            barcode: '4800000004003',
            price: 165.00,
            multiplier: 1,
            
          }]
        },
        expiryDate: new Date('2026-07-30'),
        categoryId: categories[3].id,
      },
    }),
  ]);
  console.log('✅ Products created:', products.length, 'items');

  // Create sample orders
  const order1 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-260525-0001',
      totalAmount: 1245.00,
      status: 'delivered',
      paymentStatus: 'paid',
      notes: 'Regular weekly order',
      customerId: customers[0].id,
      createdById: admin.id,
      items: {
        create: [
          { productId: products[0].id, quantity: 3, price: 285.00, subtotal: 855.00 },
          { productId: products[4].id, quantity: 5, price: 68.00, subtotal: 340.00 },
          { productId: products[8].id, quantity: 2, price: 22.00, subtotal: 44.00 },
        ],
      },
      delivery: {
        create: {
          driverName: 'Carlos Rivera',
          driverPhone: '+63 930 111 2222',
          scheduledDate: new Date('2026-05-25'),
          deliveredAt: new Date('2026-05-25'),
          status: 'delivered',
        },
      },
    },
  });

  const order2 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-260526-0002',
      totalAmount: 2180.00,
      status: 'confirmed',
      paymentStatus: 'unpaid',
      customerId: customers[1].id,
      createdById: staff.id,
      items: {
        create: [
          { productId: products[4].id, quantity: 10, price: 68.00, subtotal: 680.00 },
          { productId: products[6].id, quantity: 20, price: 25.00, subtotal: 500.00 },
          { productId: products[12].id, quantity: 5, price: 198.00, subtotal: 990.00 },
        ],
      },
      delivery: {
        create: {
          driverName: 'Miguel Torres',
          driverPhone: '+63 931 222 3333',
          scheduledDate: new Date('2026-05-28'),
          status: 'pending',
        },
      },
    },
  });

  const order3 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-260526-0003',
      totalAmount: 875.00,
      status: 'pending',
      paymentStatus: 'unpaid',
      notes: 'Urgent order - need by tomorrow',
      customerId: customers[2].id,
      createdById: admin.id,
      items: {
        create: [
          { productId: products[1].id, quantity: 5, price: 175.00, subtotal: 875.00 },
        ],
      },
    },
  });

  const order4 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-260524-0004',
      totalAmount: 3520.00,
      status: 'delivered',
      paymentStatus: 'paid',
      customerId: customers[3].id,
      createdById: admin.id,
      items: {
        create: [
          { productId: products[0].id, quantity: 5, price: 285.00, subtotal: 1425.00 },
          { productId: products[2].id, quantity: 5, price: 195.00, subtotal: 975.00 },
          { productId: products[9].id, quantity: 10, price: 45.00, subtotal: 450.00 },
          { productId: products[10].id, quantity: 5, price: 38.00, subtotal: 190.00 },
          { productId: products[7].id, quantity: 16, price: 30.00, subtotal: 480.00 },
        ],
      },
      delivery: {
        create: {
          driverName: 'Carlos Rivera',
          driverPhone: '+63 930 111 2222',
          scheduledDate: new Date('2026-05-24'),
          deliveredAt: new Date('2026-05-24'),
          status: 'delivered',
        },
      },
    },
  });

  const order5 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-260527-0005',
      totalAmount: 1590.00,
      status: 'confirmed',
      paymentStatus: 'partial',
      customerId: customers[4].id,
      createdById: staff.id,
      items: {
        create: [
          { productId: products[12].id, quantity: 3, price: 198.00, subtotal: 594.00 },
          { productId: products[14].id, quantity: 3, price: 165.00, subtotal: 495.00 },
          { productId: products[3].id, quantity: 2, price: 210.00, subtotal: 420.00 },
          { productId: products[11].id, quantity: 2, price: 35.00, subtotal: 70.00 },
        ],
      },
      delivery: {
        create: {
          driverName: 'Miguel Torres',
          driverPhone: '+63 931 222 3333',
          scheduledDate: new Date('2026-05-29'),
          status: 'pending',
        },
      },
    },
  });

  console.log('✅ Orders created:', [order1, order2, order3, order4, order5].map(o => o.orderNumber).join(', '));

  // Create stock logs
  await prisma.stockLog.createMany({
    data: [
      { productId: products[0].id, type: 'IN', quantity: 200, reason: 'Initial stock from supplier', userId: admin.id },
      { productId: products[4].id, type: 'IN', quantity: 250, reason: 'Restock delivery', userId: admin.id },
      { productId: products[0].id, type: 'OUT', quantity: 50, reason: 'Order fulfillment', userId: staff.id },
      { productId: products[8].id, type: 'IN', quantity: 600, reason: 'Bulk purchase from supplier', userId: admin.id },
      { productId: products[12].id, type: 'IN', quantity: 80, reason: 'Weekly restock', userId: staff.id },
      { productId: products[1].id, type: 'OUT', quantity: 12, reason: 'Order fulfillment', userId: staff.id },
    ],
  });
  console.log('✅ Stock logs created');

  console.log('\n🎉 Database seeding completed!');
  console.log('\n📋 Login credentials:');
  console.log('   Admin:   admin@amroding.com / password123');
  console.log('   Staff:   staff@amroding.com / staff123');
  console.log('   Cashier: cashier@amroding.com / cashier123');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
