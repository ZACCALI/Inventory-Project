export function generateOrderNumber(orderType?: string, isDelivery?: boolean): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  
  let prefix = 'HOME';
  if (orderType === 'pos' || orderType === 'store') {
    prefix = 'STORE';
  } else if (isDelivery) {
    prefix = 'DELIVERY';
  } else {
    prefix = 'WALKIN';
  }
  
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}-${rand}`;
}
