/**
 * NEXUSCONNECT - Complete Application Logic
 * All data persisted in localStorage
 */

// ==================== STATE MANAGEMENT ====================
const Storage = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch { return null; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
  remove(key) { localStorage.removeItem(key); }
};

const KEYS = {
  USERS: 'nc_users',
  CURRENT_USER: 'nc_current_user',
  SESSION: 'nc_session',
  RIDES: 'nc_rides',
  RIDE_REQUESTS: 'nc_ride_requests',
  ITEMS: 'nc_items',
  SERVICES: 'nc_services',
  DELIVERIES: 'nc_deliveries',
  MESSAGES: 'nc_messages',
  NOTIFICATIONS: 'nc_notifications',
  SAVED: 'nc_saved',
  TRANSACTIONS: 'nc_transactions',
  VEHICLES: 'nc_vehicles',
  REVIEWS: 'nc_reviews',
  WALLET_CARDS: 'nc_wallet_cards'
};

// ==================== UTILITIES ====================
const Utils = {
  uuid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c=='x'?r:(r&0x3|0x8)).toString(16); }); },
  id(prefix = '') { return prefix + Math.random().toString(36).substr(2, 9); },
  now() { return new Date().toISOString(); },
  formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  },
  formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  },
  formatDateTime(dateStr) {
    return this.formatDate(dateStr) + ' at ' + this.formatTime(dateStr);
  },
  formatMoney(amount) {
    return 'P' + parseFloat(amount).toFixed(2);
  },
  timeAgo(dateStr) {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 7) return days + 'd ago';
    return this.formatDate(dateStr);
  },
  initials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  },
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
  generateReferralCode() {
    return 'NEX' + Math.random().toString(36).substr(2, 6).toUpperCase();
  },
  getVerificationLevel(user) {
    const v = user.verifications || {};
    let count = 0;
    if (v.email) count++;
    if (v.phone) count++;
    if (v.id) count++;
    if (v.student) count++;
    if (count === 0) return { level: 'Bronze', class: 'bronze' };
    if (count <= 2) return { level: 'Silver', class: 'silver' };
    if (count <= 3) return { level: 'Gold', class: 'gold' };
    return { level: 'Platinum', class: 'platinum' };
  },
  calculateTrustScore(user) {
    const v = user.verifications || {};
    let score = 30;
    if (v.email) score += 15;
    if (v.phone) score += 15;
    if (v.id) score += 20;
    if (v.student) score += 20;
    const reviews = (Storage.get(KEYS.REVIEWS) || []).filter(r => r.toUserId === user.id);
    if (reviews.length > 0) {
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      score += Math.round(avg * 2);
    }
    return Math.min(score, 100);
  }
};

// ==================== TOAST NOTIFICATIONS ====================
const Toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(type, title, message, duration = 4000) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `
      <div class="toast-icon">${icons[type]}</div>
      <div class="toast-content">
        <div class="toast-title">${Utils.escapeHtml(title)}</div>
        <div class="toast-message">${Utils.escapeHtml(message)}</div>
      </div>
      <button class="toast-close">&times;</button>
    `;
    this.container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    toast.querySelector('.toast-close').onclick = () => this.dismiss(toast);
    setTimeout(() => this.dismiss(toast), duration);
  },
  dismiss(toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }
};

// ==================== MODAL ====================
const Modal = {
  open(html, onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close, [data-close]')?.addEventListener('click', () => this.close(overlay, onClose));
    overlay.addEventListener('click', e => { if (e.target === overlay) this.close(overlay, onClose); });
    requestAnimationFrame(() => overlay.classList.add('show'));
    return overlay;
  },
  close(overlay, callback) {
    overlay.classList.remove('show');
    setTimeout(() => { overlay.remove(); callback?.(); }, 300);
  }
};

// ==================== AUTH ====================
const Auth = {
  getCurrentUser() {
    const session = Storage.get(KEYS.SESSION);
    if (!session) return null;
    if (session.expires && new Date() > new Date(session.expires)) {
      this.logout();
      return null;
    }
    const users = Storage.get(KEYS.USERS) || [];
    return users.find(u => u.id === session.userId) || null;
  },
  login(email, password, remember = false) {
    const users = Storage.get(KEYS.USERS) || [];
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return false;
    const session = { userId: user.id, loginAt: Utils.now() };
    if (remember) {
      session.expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    Storage.set(KEYS.SESSION, session);
    Storage.set(KEYS.CURRENT_USER, user);
    return true;
  },
  logout() {
    Storage.remove(KEYS.SESSION);
    Storage.remove(KEYS.CURRENT_USER);
    window.location.href = 'login.html';
  },
  signup(data) {
    const users = Storage.get(KEYS.USERS) || [];
    if (users.some(u => u.email === data.email)) return { success: false, message: 'Email already registered' };

    const referralCode = Utils.generateReferralCode();
    const user = {
      id: Utils.uuid(),
      name: data.name,
      email: data.email,
      password: data.password,
      institution: data.institution || '',
      referralCode: referralCode,
      referredBy: data.referralCode || null,
      verifications: { email: true, phone: false, id: false, student: false },
      trustScore: 45,
      createdAt: Utils.now(),
      walletBalance: 0,
      pendingBalance: 0,
      referralCount: 0,
      referralEarnings: 0,
      avatar: null
    };
    users.push(user);
    Storage.set(KEYS.USERS, users);

    // Process referral
    if (data.referralCode) {
      const referrer = users.find(u => u.referralCode === data.referralCode);
      if (referrer) {
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        Storage.set(KEYS.USERS, users);
        this.addNotification(referrer.id, 'referral', `${data.name} signed up with your referral code! You'll earn P50 after their first transaction.`);
      }
    }

    this.login(data.email, data.password, false);
    return { success: true };
  },
  updateUser(userId, updates) {
    const users = Storage.get(KEYS.USERS) || [];
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    users[idx] = { ...users[idx], ...updates, trustScore: Utils.calculateTrustScore({ ...users[idx], ...updates }) };
    Storage.set(KEYS.USERS, users);
    const current = this.getCurrentUser();
    if (current && current.id === userId) {
      Storage.set(KEYS.CURRENT_USER, users[idx]);
    }
    return true;
  },
  addNotification(userId, type, message) {
    const notifications = Storage.get(KEYS.NOTIFICATIONS) || [];
    notifications.unshift({
      id: Utils.uuid(),
      userId,
      type,
      message,
      read: false,
      createdAt: Utils.now()
    });
    Storage.set(KEYS.NOTIFICATIONS, notifications);
  },
  getUnreadCount() {
    const user = this.getCurrentUser();
    if (!user) return 0;
    const notifications = Storage.get(KEYS.NOTIFICATIONS) || [];
    return notifications.filter(n => n.userId === user.id && !n.read).length;
  },
  getUnreadMessages() {
    const user = this.getCurrentUser();
    if (!user) return 0;
    const messages = Storage.get(KEYS.MESSAGES) || [];
    return messages.filter(m => m.toUserId === user.id && !m.read).length;
  }
};

// ==================== WALLET ====================
const Wallet = {
  getBalance() {
    const user = Auth.getCurrentUser();
    return user ? (user.walletBalance || 0) : 0;
  },
  addFunds(userId, amount, description = 'Top-up') {
    const users = Storage.get(KEYS.USERS) || [];
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    users[idx].walletBalance = (users[idx].walletBalance || 0) + parseFloat(amount);
    Storage.set(KEYS.USERS, users);
    this.addTransaction(userId, 'income', amount, description);
    Auth.updateUser(userId, {}); // refresh
    return true;
  },
  deductFunds(userId, amount, description = 'Payment') {
    const users = Storage.get(KEYS.USERS) || [];
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    const bal = users[idx].walletBalance || 0;
    if (bal < amount) return false;
    users[idx].walletBalance = bal - parseFloat(amount);
    Storage.set(KEYS.USERS, users);
    this.addTransaction(userId, 'expense', amount, description);
    Auth.updateUser(userId, {}); // refresh
    return true;
  },
  transfer(fromUserId, toUserId, amount, description) {
    if (!this.deductFunds(fromUserId, amount, description)) return false;
    this.addFunds(toUserId, amount, description);
    return true;
  },
  addTransaction(userId, type, amount, description) {
    const transactions = Storage.get(KEYS.TRANSACTIONS) || [];
    transactions.unshift({
      id: Utils.uuid(),
      userId,
      type,
      amount: parseFloat(amount),
      description,
      createdAt: Utils.now()
    });
    Storage.set(KEYS.TRANSACTIONS, transactions);
  },
  getTransactions(userId) {
    const transactions = Storage.get(KEYS.TRANSACTIONS) || [];
    return transactions.filter(t => t.userId === userId);
  }
};

// ==================== RIDES ====================
const Rides = {
  create(data) {
    const user = Auth.getCurrentUser();
    if (!user) return null;
    const rides = Storage.get(KEYS.RIDES) || [];
    const ride = {
      id: Utils.uuid(),
      driverId: user.id,
      driverName: user.name,
      from: data.from,
      to: data.to,
      date: data.date,
      time: data.time,
      seats: parseInt(data.seats),
      availableSeats: parseInt(data.seats),
      price: parseFloat(data.price),
      vehicle: data.vehicle,
      recurring: data.recurring || false,
      options: data.options || [],
      status: 'active',
      createdAt: Utils.now()
    };
    rides.push(ride);
    Storage.set(KEYS.RIDES, rides);
    return ride;
  },
  getAll() {
    return Storage.get(KEYS.RIDES) || [];
  },
  getAvailable(excludeUserId) {
    const rides = this.getAll();
    return rides.filter(r => r.driverId !== excludeUserId && r.status === 'active' && r.availableSeats > 0);
  },
  getMyRides(userId) {
    const rides = this.getAll();
    return rides.filter(r => r.driverId === userId);
  },
  getMyRequests(userId) {
    const requests = Storage.get(KEYS.RIDE_REQUESTS) || [];
    return requests.filter(r => {
      const ride = this.getAll().find(ride => ride.id === r.rideId);
      return ride && ride.driverId === userId;
    });
  },
  requestRide(rideId, seats = 1) {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    const rides = this.getAll();
    const ride = rides.find(r => r.id === rideId);
    if (!ride || ride.availableSeats < seats) return false;

    const requests = Storage.get(KEYS.RIDE_REQUESTS) || [];
    if (requests.some(r => r.rideId === rideId && r.passengerId === user.id && r.status === 'pending')) {
      return false;
    }

    requests.push({
      id: Utils.uuid(),
      rideId,
      passengerId: user.id,
      passengerName: user.name,
      seats,
      status: 'pending',
      createdAt: Utils.now()
    });
    Storage.set(KEYS.RIDE_REQUESTS, requests);
    Auth.addNotification(ride.driverId, 'ride', `${user.name} requested ${seats} seat(s) on your ride from ${ride.from} to ${ride.to}`);
    return true;
  },
  acceptRequest(requestId) {
    const requests = Storage.get(KEYS.RIDE_REQUESTS) || [];
    const req = requests.find(r => r.id === requestId);
    if (!req) return false;
    req.status = 'accepted';
    Storage.set(KEYS.RIDE_REQUESTS, requests);

    const rides = this.getAll();
    const ride = rides.find(r => r.id === req.rideId);
    if (ride) {
      ride.availableSeats -= req.seats;
      Storage.set(KEYS.RIDES, rides);
    }
    Auth.addNotification(req.passengerId, 'ride', `Your ride request from ${ride.from} to ${ride.to} was accepted!`);
    return true;
  },
  declineRequest(requestId) {
    const requests = Storage.get(KEYS.RIDE_REQUESTS) || [];
    const req = requests.find(r => r.id === requestId);
    if (!req) return false;
    req.status = 'declined';
    Storage.set(KEYS.RIDE_REQUESTS, requests);
    const rides = this.getAll();
    const ride = rides.find(r => r.id === req.rideId);
    Auth.addNotification(req.passengerId, 'ride', `Your ride request from ${ride.from} to ${ride.to} was declined.`);
    return true;
  },
  completeRide(rideId) {
    const rides = this.getAll();
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return false;
    ride.status = 'completed';
    Storage.set(KEYS.RIDES, rides);
    return true;
  }
};

// ==================== MARKETPLACE ====================
const Marketplace = {
  createItem(data) {
    const user = Auth.getCurrentUser();
    if (!user) return null;
    const items = Storage.get(KEYS.ITEMS) || [];
    const item = {
      id: Utils.uuid(),
      sellerId: user.id,
      sellerName: user.name,
      title: data.title,
      category: data.category,
      price: parseFloat(data.price),
      description: data.description,
      condition: data.condition,
      location: data.location,
      status: 'available',
      createdAt: Utils.now()
    };
    items.push(item);
    Storage.set(KEYS.ITEMS, items);
    return item;
  },
  getAll() {
    return (Storage.get(KEYS.ITEMS) || []).filter(i => i.status === 'available');
  },
  getMyItems(userId) {
    return (Storage.get(KEYS.ITEMS) || []).filter(i => i.sellerId === userId);
  },
  getItem(id) {
    return (Storage.get(KEYS.ITEMS) || []).find(i => i.id === id);
  },
  buyItem(itemId) {
    const user = Auth.getCurrentUser();
    if (!user) return { success: false, message: 'Please login' };
    const items = Storage.get(KEYS.ITEMS) || [];
    const item = items.find(i => i.id === itemId);
    if (!item) return { success: false, message: 'Item not found' };
    if (item.sellerId === user.id) return { success: false, message: 'Cannot buy your own item' };

    const fee = item.price * 0.05;
    const sellerAmount = item.price - fee;

    if (!Wallet.deductFunds(user.id, item.price, `Purchase: ${item.title}`)) {
      return { success: false, message: 'Insufficient wallet balance' };
    }

    Wallet.addFunds(item.sellerId, sellerAmount, `Sale: ${item.title}`);
    item.status = 'sold';
    item.buyerId = user.id;
    item.buyerName = user.name;
    item.soldAt = Utils.now();
    Storage.set(KEYS.ITEMS, items);

    Auth.addNotification(item.sellerId, 'purchase', `${user.name} bought your item "${item.title}" for ${Utils.formatMoney(item.price)}`);
    Auth.addNotification(user.id, 'purchase', `You purchased "${item.title}" for ${Utils.formatMoney(item.price)}`);

    // Check referral reward
    this.checkReferralReward(item.sellerId);
    this.checkReferralReward(user.id);

    return { success: true };
  },
  checkReferralReward(userId) {
    const users = Storage.get(KEYS.USERS) || [];
    const user = users.find(u => u.id === userId);
    if (!user || !user.referredBy) return;

    const transactions = Storage.get(KEYS.TRANSACTIONS) || [];
    const userTxns = transactions.filter(t => t.userId === userId);
    if (userTxns.length === 1) { // First transaction
      const referrer = users.find(u => u.referralCode === user.referredBy);
      if (referrer) {
        const reward = 50;
        referrer.referralEarnings = (referrer.referralEarnings || 0) + reward;
        referrer.walletBalance = (referrer.walletBalance || 0) + reward;
        Storage.set(KEYS.USERS, users);
        Wallet.addTransaction(referrer.id, 'income', reward, `Referral bonus from ${user.name}`);
        Auth.addNotification(referrer.id, 'referral', `You earned P${reward} referral bonus! ${user.name} completed their first transaction.`);
      }
    }
  }
};

// ==================== SERVICES ====================
const Services = {
  create(data) {
    const user = Auth.getCurrentUser();
    if (!user) return null;
    const services = Storage.get(KEYS.SERVICES) || [];
    const service = {
      id: Utils.uuid(),
      providerId: user.id,
      providerName: user.name,
      title: data.title,
      category: data.category,
      price: parseFloat(data.price),
      description: data.description,
      availability: data.availability || [],
      status: 'active',
      createdAt: Utils.now()
    };
    services.push(service);
    Storage.set(KEYS.SERVICES, services);
    return service;
  },
  getAll() {
    return (Storage.get(KEYS.SERVICES) || []).filter(s => s.status === 'active');
  },
  getMyServices(userId) {
    return (Storage.get(KEYS.SERVICES) || []).filter(s => s.providerId === userId);
  },
  bookService(serviceId, hours = 1) {
    const user = Auth.getCurrentUser();
    if (!user) return { success: false, message: 'Please login' };
    const services = Storage.get(KEYS.SERVICES) || [];
    const service = services.find(s => s.id === serviceId);
    if (!service) return { success: false, message: 'Service not found' };
    if (service.providerId === user.id) return { success: false, message: 'Cannot book your own service' };

    const deposit = service.price * hours * 0.2;
    if (!Wallet.deductFunds(user.id, deposit, `Service deposit: ${service.title}`)) {
      return { success: false, message: 'Insufficient wallet balance for deposit' };
    }

    const bookings = Storage.get(KEYS.DELIVERIES) || []; // reuse deliveries key for bookings
    const booking = {
      id: Utils.uuid(),
      type: 'service',
      serviceId,
      serviceTitle: service.title,
      providerId: service.providerId,
      providerName: service.providerName,
      clientId: user.id,
      clientName: user.name,
      hours,
      deposit,
      totalPrice: service.price * hours,
      status: 'booked',
      createdAt: Utils.now()
    };
    bookings.push(booking);
    Storage.set(KEYS.DELIVERIES, bookings);

    Auth.addNotification(service.providerId, 'system', `${user.name} booked your service "${service.title}" (${hours}h, deposit ${Utils.formatMoney(deposit)})`);
    return { success: true, booking };
  },
  completeBooking(bookingId) {
    const bookings = Storage.get(KEYS.DELIVERIES) || [];
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return false;
    booking.status = 'completed';
    Storage.set(KEYS.DELIVERIES, bookings);

    const remaining = booking.totalPrice - booking.deposit;
    Wallet.deductFunds(booking.clientId, remaining, `Service payment: ${booking.serviceTitle}`);
    Wallet.addFunds(booking.providerId, booking.totalPrice * 0.95, `Service completed: ${booking.serviceTitle}`);

    Auth.addNotification(booking.clientId, 'system', `Service "${booking.serviceTitle}" marked as completed!`);
    return true;
  }
};

// ==================== DELIVERIES ====================
const Deliveries = {
  create(data) {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    const deliveries = Storage.get(KEYS.DELIVERIES) || [];
    const delivery = {
      id: Utils.uuid(),
      type: 'delivery',
      customerId: user.id,
      customerName: user.name,
      pickup: data.pickup,
      dropoff: data.dropoff,
      itemDescription: data.itemDescription,
      size: data.size,
      timeWindow: data.timeWindow,
      instructions: data.instructions,
      status: 'pending',
      tracking: [
        { status: 'pending', time: Utils.now(), completed: true },
        { status: 'picked up', time: null, completed: false },
        { status: 'en route', time: null, completed: false },
        { status: 'delivered', time: null, completed: false }
      ],
      createdAt: Utils.now()
    };
    deliveries.push(delivery);
    Storage.set(KEYS.DELIVERIES, deliveries);
    return delivery;
  },
  getMyDeliveries(userId) {
    return (Storage.get(KEYS.DELIVERIES) || []).filter(d => d.type === 'delivery' && d.customerId === userId);
  },
  updateStatus(deliveryId, status) {
    const deliveries = Storage.get(KEYS.DELIVERIES) || [];
    const delivery = deliveries.find(d => d.id === deliveryId);
    if (!delivery) return false;
    delivery.status = status;
    const step = delivery.tracking.find(t => t.status === status);
    if (step) { step.completed = true; step.time = Utils.now(); }
    Storage.set(KEYS.DELIVERIES, deliveries);
    Auth.addNotification(delivery.customerId, 'system', `Your delivery is now ${status}!`);
    return true;
  }
};

// ==================== MESSAGES ====================
const Messages = {
  send(toUserId, content, relatedId = null, relatedType = null) {
    const user = Auth.getCurrentUser();
    if (!user) return null;
    const messages = Storage.get(KEYS.MESSAGES) || [];
    const msg = {
      id: Utils.uuid(),
      fromUserId: user.id,
      fromName: user.name,
      toUserId,
      content,
      relatedId,
      relatedType,
      read: false,
      createdAt: Utils.now()
    };
    messages.push(msg);
    Storage.set(KEYS.MESSAGES, messages);
    Auth.addNotification(toUserId, 'message', `New message from ${user.name}`);
    return msg;
  },
  getConversations(userId) {
    const messages = Storage.get(KEYS.MESSAGES) || [];
    const convs = {};
    messages.forEach(m => {
      const otherId = m.fromUserId === userId ? m.toUserId : m.fromUserId;
      if (!convs[otherId]) {
        convs[otherId] = { userId: otherId, messages: [], unread: 0 };
      }
      convs[otherId].messages.push(m);
      if (m.toUserId === userId && !m.read) convs[otherId].unread++;
    });
    return Object.values(convs).sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1];
      const bLast = b.messages[b.messages.length - 1];
      return new Date(bLast.createdAt) - new Date(aLast.createdAt);
    });
  },
  getMessages(userId, otherId) {
    const messages = Storage.get(KEYS.MESSAGES) || [];
    return messages.filter(m => 
      (m.fromUserId === userId && m.toUserId === otherId) ||
      (m.fromUserId === otherId && m.toUserId === userId)
    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },
  markRead(userId, otherId) {
    const messages = Storage.get(KEYS.MESSAGES) || [];
    messages.forEach(m => {
      if (m.toUserId === userId && m.fromUserId === otherId) m.read = true;
    });
    Storage.set(KEYS.MESSAGES, messages);
  },
  getUserName(userId) {
    const users = Storage.get(KEYS.USERS) || [];
    const user = users.find(u => u.id === userId);
    return user ? user.name : 'Unknown';
  }
};

// ==================== SAVED ITEMS ====================
const Saved = {
  toggle(type, id) {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    const saved = Storage.get(KEYS.SAVED) || [];
    const idx = saved.findIndex(s => s.userId === user.id && s.type === type && s.itemId === id);
    if (idx > -1) {
      saved.splice(idx, 1);
      Storage.set(KEYS.SAVED, saved);
      return false;
    }
    saved.push({ userId: user.id, type, itemId: id, createdAt: Utils.now() });
    Storage.set(KEYS.SAVED, saved);
    return true;
  },
  isSaved(type, id) {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    const saved = Storage.get(KEYS.SAVED) || [];
    return saved.some(s => s.userId === user.id && s.type === type && s.itemId === id);
  },
  getSaved(userId) {
    const saved = Storage.get(KEYS.SAVED) || [];
    return saved.filter(s => s.userId === userId);
  }
};

// ==================== REVIEWS ====================
const Reviews = {
  create(data) {
    const user = Auth.getCurrentUser();
    if (!user) return null;
    const reviews = Storage.get(KEYS.REVIEWS) || [];
    const review = {
      id: Utils.uuid(),
      fromUserId: user.id,
      fromName: user.name,
      toUserId: data.toUserId,
      rating: parseInt(data.rating),
      comment: data.comment,
      relatedId: data.relatedId,
      relatedType: data.relatedType,
      createdAt: Utils.now()
    };
    reviews.push(review);
    Storage.set(KEYS.REVIEWS, reviews);
    Auth.updateUser(data.toUserId, {}); // refresh trust score
    return review;
  },
  getForUser(userId) {
    return (Storage.get(KEYS.REVIEWS) || []).filter(r => r.toUserId === userId);
  },
  getAverage(userId) {
    const reviews = this.getForUser(userId);
    if (reviews.length === 0) return 0;
    return (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);
  }
};

// ==================== VEHICLES ====================
const Vehicles = {
  create(data) {
    const user = Auth.getCurrentUser();
    if (!user) return null;
    const vehicles = Storage.get(KEYS.VEHICLES) || [];
    const vehicle = {
      id: Utils.uuid(),
      userId: user.id,
      make: data.make,
      model: data.model,
      year: data.year,
      color: data.color,
      plate: data.plate,
      seats: parseInt(data.seats),
      createdAt: Utils.now()
    };
    vehicles.push(vehicle);
    Storage.set(KEYS.VEHICLES, vehicles);
    return vehicle;
  },
  getMine(userId) {
    return (Storage.get(KEYS.VEHICLES) || []).filter(v => v.userId === userId);
  },
  delete(id) {
    const vehicles = Storage.get(KEYS.VEHICLES) || [];
    Storage.set(KEYS.VEHICLES, vehicles.filter(v => v.id !== id));
  }
};

// ==================== UI COMPONENTS ====================
const UI = {
  renderNav() {
    const user = Auth.getCurrentUser();
    const nav = document.getElementById('mainNav');
    if (!nav) return;

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const pages = [
      { url: 'dashboard.html', label: 'Dashboard', icon: '📊' },
      { url: 'rides.html', label: 'Rides', icon: '🚗' },
      { url: 'marketplace.html', label: 'Marketplace', icon: '🛒' },
      { url: 'services.html', label: 'Services', icon: '🛠️' },
      { url: 'deliveries.html', label: 'Deliveries', icon: '📦' }
    ];

    let navHtml = pages.map(p => {
      const active = currentPage === p.url ? 'active' : '';
      return `<a href="${p.url}" class="nav-link ${active}"><span>${p.icon}</span>${p.label}</a>`;
    }).join('');

    nav.innerHTML = navHtml;

    // Update wallet badge
    const walletBadge = document.getElementById('navWallet');
    if (walletBadge && user) {
      walletBadge.innerHTML = `<span>💰</span>${Utils.formatMoney(user.walletBalance || 0)}`;
    }

    // Update notification badge
    const notifBadge = document.getElementById('navNotifications');
    if (notifBadge) {
      const count = Auth.getUnreadCount();
      notifBadge.innerHTML = `<span>🔔</span>${count > 0 ? `<span class="badge">${count}</span>` : ''}`;
    }

    // Update message badge
    const msgBadge = document.getElementById('navMessages');
    if (msgBadge) {
      const count = Auth.getUnreadMessages();
      msgBadge.innerHTML = `<span>💬</span>${count > 0 ? `<span class="badge">${count}</span>` : ''}`;
    }

    // Update user menu
    const userMenu = document.getElementById('userMenuName');
    const userEmail = document.getElementById('userMenuEmail');
    const userAvatar = document.getElementById('userAvatar');
    if (user && userMenu) {
      userMenu.textContent = user.name;
      userEmail.textContent = user.email;
      userAvatar.textContent = Utils.initials(user.name);
    }
  },

  initMobileMenu() {
    const btn = document.getElementById('mobileMenuBtn');
    const menu = document.getElementById('mobileMenu');
    if (btn && menu) {
      btn.addEventListener('click', () => menu.classList.toggle('show'));
    }
  },

  initUserDropdown() {
    const avatar = document.getElementById('userAvatar');
    const dropdown = document.getElementById('userDropdown');
    if (avatar && dropdown) {
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
      });
      document.addEventListener('click', () => dropdown.classList.remove('show'));
    }
  },

  initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 10);
      });
    }
  }
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  UI.renderNav();
  UI.initMobileMenu();
  UI.initUserDropdown();
  UI.initNavbarScroll();
});
