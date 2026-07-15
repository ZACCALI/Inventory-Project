import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const type = request.nextUrl.searchParams.get('type') || 'dashboard';

    if (type === 'dashboard') {
      // Use aggregation queries instead of loading all products
      const [productStats, totalProducts, pendingOrders, recentOrders, lowStockProducts, deliveryStats, recentDeliveries] = await Promise.all([
        prisma.product.aggregate({
          where: { isArchived: false },
          _sum: { stock: true },
          _count: true,
        }),
        prisma.product.count({ where: { isArchived: false } }),
        prisma.order.count({ where: { status: 'pending', isArchived: false } }),
        prisma.order.findMany({
          where: { isArchived: false },
          include: { customer: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        prisma.product.findMany({
          where: { isArchived: false },
          include: { category: { select: { name: true } } },
          orderBy: { stock: 'asc' },
        }).then(products => products.filter(p => p.stock <= p.minStock).slice(0, 10).map(p => ({
          id: p.id, name: p.name, stock: p.stock, minStock: p.minStock, categoryName: p.category?.name || null
        }))),
        prisma.delivery.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
        prisma.delivery.findMany({
          include: { driver: true, order: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      // Calculate stock value using aggregation
      const allProducts = await prisma.product.findMany({
        where: { isArchived: false },
        select: { stock: true, costPrice: true },
      });
      const stockValueResult = [{ total: allProducts.reduce((sum, p) => sum + (p.stock * p.costPrice), 0) }];
      const totalStockValue = Number(stockValueResult[0]?.total || 0);

      // Today's sales in Asia/Manila (PST, UTC+8) timezone
      const nowUTC = new Date();
      const pstTime = nowUTC.getTime() + (8 * 3600000);
      const pstDate = new Date(pstTime);
      pstDate.setUTCHours(0, 0, 0, 0);
      const todayUTC = new Date(pstDate.getTime() - (8 * 3600000));
      const todaySalesResult = await prisma.order.aggregate({
        where: { createdAt: { gte: todayUTC }, status: { not: 'cancelled' }, isArchived: false },
        _sum: { totalAmount: true },
      });

      const deliveryStatsFormatted = deliveryStats.map(d => ({
        name: d.status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        value: d._count.status
      }));
      if (deliveryStatsFormatted.length === 0) {
        deliveryStatsFormatted.push({ name: 'No Data', value: 1 });
      }

      // Map low stock products to expected format
      const lowStockFormatted = lowStockProducts.map(p => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        minStock: p.minStock,
        category: p.categoryName ? { name: p.categoryName } : null,
      }));

      const todayExpensesResult = await prisma.expense.aggregate({
        where: { date: { gte: todayUTC } },
        _sum: { amount: true },
      });

      const todayCollectionsResult = await prisma.payment.aggregate({
        where: { createdAt: { gte: todayUTC } },
        _sum: { amount: true },
      });

      const unpaidOrders = await prisma.order.findMany({
        where: { status: { not: 'cancelled' }, paymentStatus: { in: ['unpaid', 'partial'] }, isArchived: false },
        select: { totalAmount: true, payments: { select: { amount: true } } }
      });
      
      let totalReceivables = 0;
      for (const o of unpaidOrders) {
        const paid = o.payments.reduce((sum, p) => sum + p.amount, 0);
        totalReceivables += (o.totalAmount - paid);
      }

      return NextResponse.json({
        totalProducts,
        totalStock: productStats._sum.stock || 0,
        totalStockValue,
        todaySales: todaySalesResult._sum.totalAmount || 0,
        todayCollections: todayCollectionsResult._sum.amount || 0,
        totalReceivables,
        todayExpenses: todayExpensesResult._sum.amount || 0,
        lowStockCount: lowStockFormatted.length,
        pendingOrders,
        recentOrders,
        lowStockProducts: lowStockFormatted,
        deliveryStats: deliveryStatsFormatted,
        recentDeliveries,
      });
    }

    if (type === 'inventory' || type === 'monthly' || type === 'bestsellers') {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Access denied. Only Admins can view detailed reports.' }, { status: 403 });
      }
    }

    if (type === 'sales') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const orders = await prisma.order.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          status: { not: 'cancelled' },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Group by date in Asia/Manila (PST, UTC+8) timezone
      const salesByDate: Record<string, number> = {};
      const nowUTC = new Date();
      for (let i = 0; i < 30; i++) {
        const date = new Date(nowUTC.getTime() + (8 * 3600000));
        date.setUTCDate(date.getUTCDate() - (29 - i));
        const key = date.toISOString().split('T')[0];
        salesByDate[key] = 0;
      }

      orders.forEach(order => {
        const orderPST = new Date(new Date(order.createdAt).getTime() + (8 * 3600000));
        const key = orderPST.toISOString().split('T')[0];
        if (salesByDate[key] !== undefined) {
          salesByDate[key] += order.totalAmount;
        }
      });

      const dailySales = Object.entries(salesByDate).map(([date, sales]) => ({
        date: new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        sales,
      }));

      return NextResponse.json({ dailySales });
    }

    if (type === 'bestsellers') {
      const validItems = await prisma.orderItem.findMany({
        where: { order: { status: { not: 'cancelled' }, isArchived: false } },
        select: { productId: true, quantity: true, subtotal: true, multiplier: true }
      });
      
      const salesMap: Record<string, { quantity: number, revenue: number }> = {};
      validItems.forEach(item => {
        if (!salesMap[item.productId]) salesMap[item.productId] = { quantity: 0, revenue: 0 };
        // We multiply quantity by multiplier to get actual base unit count!
        salesMap[item.productId].quantity += (item.quantity * (item.multiplier || 1));
        salesMap[item.productId].revenue += item.subtotal;
      });

      const sortedIds = Object.keys(salesMap).sort((a, b) => salesMap[b].quantity - salesMap[a].quantity).slice(0, 10);
      
      const products = await prisma.product.findMany({
        where: { id: { in: sortedIds } },
        include: { category: true },
      });

      const bestsellers = sortedIds.map(id => {
        const product = products.find(p => p.id === id);
        return {
          product,
          totalQuantity: salesMap[id].quantity,
          totalRevenue: salesMap[id].revenue,
        };
      });

      return NextResponse.json({ bestsellers });
    }

    if (type === 'monthly') {
      const orders = await prisma.order.findMany({
        where: { status: { not: 'cancelled' } },
        include: { items: { include: { product: true } } },
      });

      const expenses = await prisma.expense.findMany();
      const payments = await prisma.payment.findMany();
      const unpaidOrders = await prisma.order.findMany({
        where: { status: { not: 'cancelled' }, paymentStatus: { in: ['unpaid', 'partial'] }, isArchived: false },
        select: { totalAmount: true, payments: { select: { amount: true } } }
      });
      let totalReceivables = 0;
      for (const o of unpaidOrders) {
        const paid = o.payments.reduce((sum, p) => sum + p.amount, 0);
        totalReceivables += (o.totalAmount - paid);
      }

      const monthlySummary: Record<string, { revenue: number; cost: number; orders: number; expenses: number; collections: number }> = {};

      orders.forEach(order => {
        const orderPST = new Date(new Date(order.createdAt).getTime() + (8 * 3600000));
        const year = orderPST.getUTCFullYear();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const key = `${monthNames[orderPST.getUTCMonth()]} ${year}`;
        if (!monthlySummary[key]) {
          monthlySummary[key] = { revenue: 0, cost: 0, orders: 0, expenses: 0, collections: 0 };
        }
        monthlySummary[key].revenue += order.totalAmount;
        monthlySummary[key].orders += 1;
        order.items.forEach(item => {
          monthlySummary[key].cost += item.quantity * (item.product?.costPrice || 0);
        });
      });

      expenses.forEach(expense => {
        const datePST = new Date(new Date(expense.date).getTime() + (8 * 3600000));
        const year = datePST.getUTCFullYear();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const key = `${monthNames[datePST.getUTCMonth()]} ${year}`;
        if (!monthlySummary[key]) {
          monthlySummary[key] = { revenue: 0, cost: 0, orders: 0, expenses: 0, collections: 0 };
        }
        monthlySummary[key].expenses += expense.amount;
      });

      payments.forEach(payment => {
        const datePST = new Date(new Date(payment.createdAt).getTime() + (8 * 3600000));
        const year = datePST.getUTCFullYear();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const key = `${monthNames[datePST.getUTCMonth()]} ${year}`;
        if (!monthlySummary[key]) {
          monthlySummary[key] = { revenue: 0, cost: 0, orders: 0, expenses: 0, collections: 0 };
        }
        monthlySummary[key].collections += payment.amount;
      });

      const monthly = Object.entries(monthlySummary).map(([month, data]) => ({
        month,
        revenue: data.revenue,
        cost: data.cost,
        expenses: data.expenses,
        collections: data.collections || 0,
        profit: data.revenue - data.cost - data.expenses,
        orders: data.orders,
      })).sort((a, b) => {
        const dateA = new Date(a.month);
        const dateB = new Date(b.month);
        return dateA.getTime() - dateB.getTime();
      });

      return NextResponse.json({ monthly, totalReceivables });
    }

    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
  } catch (error) {
    console.error('Reports API error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
