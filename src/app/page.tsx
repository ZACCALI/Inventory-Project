'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Package, ShoppingCart, Truck, BarChart3, ScanBarcode, Receipt,
  ArrowRight, CheckCircle2, CarFront, Shield, Zap, Users, ChevronRight,
  Phone, Mail, MapPin, Clock, Star, TrendingUp,
} from 'lucide-react';

/* ── Scroll Animation Hook ── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          } else {
            entry.target.classList.remove('revealed');
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    // Observe the container and all children with .reveal-item
    const items = el.querySelectorAll('.reveal-item');
    items.forEach((item) => observer.observe(item));
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return ref;
}

/* ── Data ── */
const trustBadges = [
  { icon: CheckCircle2, title: 'Quality Products', desc: 'We source and distribute trusted and high-quality merchandise.' },
  { icon: Clock, title: 'Timely Delivery', desc: 'Our logistics team ensures fast and on-time delivery every time.' },
  { icon: Shield, title: 'Inventory Accuracy', desc: 'Real-time stock tracking to prevent shortages and overstock.' },
  { icon: Star, title: 'Customer Satisfaction', desc: 'We build long-term relationships through excellent service.' },
];

const services = [
  { icon: Package, title: 'Food and Grocery Distribution', desc: 'Ensuring consistent supply of essential food and grocery items to retailers.' },
  { icon: Zap, title: 'Frozen Product Distribution', desc: 'Specialized handling and storage for frozen products to maintain quality.' },
  { icon: Truck, title: 'Wholesale and Bulk Supply', desc: 'Providing bulk supply options for commercial establishments and businesses.' },
  { icon: ShoppingCart, title: 'Retail Store Supply Solutions', desc: 'Comprehensive supply chain solutions tailored for supermarkets and stores.' },
  { icon: BarChart3, title: 'Warehousing & Inventory', desc: 'Modern facilities for safe storage and precise inventory management.' },
  { icon: CarFront, title: 'Logistics and Transportation', desc: 'Efficient and timely delivery services across our coverage areas.' },
];

const stats = [
  { value: '10+', label: 'Years of Experience' },
  { value: '500+', label: 'Happy Clients' },
  { value: '1,000+', label: 'Products Distributed' },
  { value: '15+', label: 'Delivery Vehicles' },
  { value: 'Wide', label: 'Coverage in Mindanao' },
  { value: '100%', label: 'System Reliability' },
];

const coverageAreas = [
  'Lanao del Sur',
  'Lanao del Norte',
  'Iligan City',
  'And Nearby Areas',
];

export default function LandingPage() {
  const heroRef = useScrollReveal();
  const trustRef = useScrollReveal();
  const aboutRef = useScrollReveal();
  const servicesRef = useScrollReveal();
  const whyRef = useScrollReveal();
  const coverageRef = useScrollReveal();

  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="landing-page">
      {/* ===== NAVBAR ===== */}
      <nav className={`landing-nav ${isScrolled ? 'scrolled' : ''}`}>
        <div className="landing-nav-inner">
          <div className="landing-nav-logo">
            <div className="landing-nav-logo-icon">
              <CarFront size={22} strokeWidth={2} />
            </div>
            <span>Amroding General Merchandise</span>
          </div>
          <div className="landing-nav-links">
            <a href="#" className="active">Home</a>
            <a href="#about">About Us</a>
            <a href="#services">Products & Services</a>
            <a href="#why">Why Choose Us</a>
            <a href="#coverage">Our Coverage</a>
            <a href="#coverage">Contact Us</a>
          </div>
          <div className="landing-nav-actions">
            <Link href="/login" className="landing-btn-primary">
              Login
            </Link>
          </div>
        </div>
      </nav>

      {/* ===== HERO — White background ===== */}
      <section className="landing-hero" ref={heroRef}>
        <div className="landing-hero-content reveal-item">
          <span className="landing-hero-welcome">WELCOME TO</span>
          <h1 className="landing-hero-title">
            YOUR TRUSTED<br />DISTRIBUTION PARTNER<br /><span className="landing-hero-highlight">IN MINDANAO</span>
          </h1>
          <p className="landing-hero-subtitle">
            We deliver quality food, grocery, and frozen products 
            with reliability and excellence across Lanao del Sur, 
            Lanao del Norte, and nearby areas in Mindanao.
          </p>
          <div className="landing-hero-actions">
            <a href="#about" className="landing-btn-primary landing-btn-lg">
              Learn More About Us
            </a>
            <a href="#coverage" className="landing-btn-outline-dark landing-btn-lg">
              Contact Us
            </a>
          </div>
        </div>
        <div className="landing-hero-visual reveal-item">
          <div className="landing-hero-image-wrapper">
            <img src="/images/hero-truck.jpg" alt="Amroding General Merchandise Trucks" className="landing-hero-image" />
          </div>
        </div>
      </section>

      {/* ===== TRUST BADGES — Light gray ===== */}
      <section className="landing-trust" ref={trustRef}>
        <div className="landing-section-inner">
          <div className="landing-trust-grid">
            {trustBadges.map((badge, i) => (
              <div key={badge.title} className="landing-trust-item reveal-item" style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="landing-trust-icon">
                  <badge.icon size={24} />
                </div>
                <h4>{badge.title}</h4>
                <p>{badge.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ABOUT — White ===== */}
      <section className="landing-about" id="about" ref={aboutRef}>
        <div className="landing-section-inner">
          <div className="landing-about-layout">
            <div className="landing-about-text reveal-item">
              <span className="landing-section-badge">ABOUT US</span>
              <h2 className="landing-section-title">Delivering Quality Products Across Mindanao Since 2010</h2>
              <p>
                Amroding General Merchandise was established in 2010 with a commitment to providing reliable distribution services and quality products to businesses and communities throughout Mindanao. Over the years, we have grown from a local trading business into a trusted distribution partner serving retailers, supermarkets, convenience stores, restaurants, wholesalers, and various commercial establishments.
              </p>
              <p>
                With more than a decade of experience in the distribution industry, we have built a strong reputation for reliability, integrity, and customer satisfaction. Our success is driven by our dedication to delivering quality products, maintaining efficient logistics operations, and building long-term relationships with our customers and business partners.
              </p>
              <p>
                We specialize in the distribution of food, grocery, frozen, and consumer products, ensuring that every item is handled with care and delivered on time. Through our warehouse facilities, transportation fleet, and experienced team, we continue to provide dependable supply chain solutions that help businesses operate smoothly and efficiently.
              </p>

              <div style={{ marginTop: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Our Mission</h3>
                <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  To provide high-quality products and reliable distribution services that support the growth and success of our customers while maintaining excellence, integrity, and customer satisfaction in everything we do.
                </p>
                
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Our Vision</h3>
                <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
                  To become one of the most trusted and respected distribution companies in Mindanao, recognized for outstanding service, operational excellence, and strong partnerships with leading brands and businesses.
                </p>
              </div>

              <a href="#services" className="landing-btn-primary" style={{ marginTop: '24px' }}>
                Explore What We Do
              </a>
            </div>
            <div className="landing-about-visual reveal-item">
              <div className="landing-about-grid">
                <div className="landing-about-card">
                  <TrendingUp size={32} />
                  <span>Growing Network</span>
                </div>
                <div className="landing-about-card">
                  <Truck size={32} />
                  <span>Fleet Ready</span>
                </div>
                <div className="landing-about-card accent">
                  <Package size={32} />
                  <span>1,000+ Products</span>
                </div>
                <div className="landing-about-card">
                  <Users size={32} />
                  <span>Trusted Partners</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SERVICES — Light gray ===== */}
      <section className="landing-features" id="services" ref={servicesRef}>
        <div className="landing-section-inner">
          <div className="landing-section-header reveal-item">
            <span className="landing-section-badge">OUR PRODUCTS & SERVICES</span>
            <h2 className="landing-section-title">Complete Distribution Solutions</h2>
          </div>
          <div className="landing-features-grid">
            {services.map((feature, i) => (
              <div key={feature.title} className="landing-feature-card reveal-item" style={{ transitionDelay: `${i * 120}ms` }}>
                <div className="landing-feature-icon">
                  <feature.icon size={28} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY CHOOSE US — Dark navy ===== */}
      <section className="landing-why" id="why" ref={whyRef}>
        <div className="landing-section-inner">
          <div className="landing-why-layout">
            <div className="landing-why-text reveal-item">
              <span className="landing-section-badge" style={{ background: 'rgba(37,99,235,0.15)', color: 'var(--primary)' }}>WHY CHOOSE US</span>
              <h2 style={{ color: '#fff', fontSize: '32px', fontWeight: 800, marginBottom: '24px' }}>
                Why Choose Amroding General Merchandise?
              </h2>
              <ul className="landing-why-list" style={{ marginBottom: '24px' }}>
                <li><CheckCircle2 size={16} color="var(--primary)" /> Serving Mindanao since 2010</li>
                <li><CheckCircle2 size={16} color="var(--primary)" /> Reliable and timely deliveries</li>
                <li><CheckCircle2 size={16} color="var(--primary)" /> Professional and experienced team</li>
                <li><CheckCircle2 size={16} color="var(--primary)" /> Strong distribution and logistics network</li>
                <li><CheckCircle2 size={16} color="var(--primary)" /> Commitment to quality and customer satisfaction</li>
                <li><CheckCircle2 size={16} color="var(--primary)" /> Trusted by retailers, wholesalers, and business partners</li>
                <li><CheckCircle2 size={16} color="var(--primary)" /> Dedicated to building long-term relationships</li>
              </ul>
              <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: '1.6', fontSize: '14px' }}>
                For over 15 years, Amroding General Merchandise has remained committed to delivering quality products and exceptional service. As we continue to grow, our focus remains the same: providing reliable distribution solutions and helping businesses succeed by ensuring that quality products reach customers across Mindanao efficiently and consistently.
              </p>
            </div>
            <div className="landing-why-stats reveal-item">
              {stats.map((stat, i) => (
                <div key={stat.label} className="landing-why-stat-card reveal-item" style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="landing-why-stat-value">{stat.value}</div>
                  <div className="landing-why-stat-label">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== COVERAGE + CTA — White ===== */}
      <section className="landing-coverage" id="coverage" ref={coverageRef}>
        <div className="landing-section-inner">
          <div className="landing-coverage-layout">
            <div className="landing-coverage-area reveal-item">
              <span className="landing-section-badge">OUR COVERAGE AREA</span>
              <h2 className="landing-section-title" style={{ textAlign: 'left' }}>Proudly Serving Mindanao</h2>
              <ul className="landing-coverage-list">
                {coverageAreas.map((area) => (
                  <li key={area}>
                    <MapPin size={16} />
                    {area}
                  </li>
                ))}
              </ul>
            </div>
            <div className="landing-coverage-cta reveal-item">
              <span className="landing-section-badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>CONTACT US</span>
              <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
                Get in Touch With Us
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.7' }}>
                We would love to hear from you! Whether you are looking for a reliable distributor, interested in wholesale orders, or have questions about our products and services, our team is ready to assist you.
              </p>
              <div className="landing-contact-items">
                <div className="landing-contact-item" style={{ alignItems: 'flex-start' }}>
                  <MapPin size={18} style={{ marginTop: '2px' }} />
                  <div>
                    <span style={{ fontWeight: 600, display: 'block', color: 'var(--text-primary)' }}>Amroding General Merchandise</span>
                    <span style={{ fontSize: '14px' }}>Serving Lanao del Sur, Lanao del Norte, and nearby areas across Mindanao</span>
                  </div>
                </div>
                <div className="landing-contact-item">
                  <Mail size={18} />
                  <span>mail.amerhantbh@gmail.com</span>
                </div>
                <div className="landing-contact-item">
                  <Star size={18} />
                  <span>Facebook: Amroding General Merchandise</span>
                </div>
                <div className="landing-contact-item">
                  <Clock size={18} />
                  <span>Sunday – Saturday | 8:00 AM – 5:00 PM</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER — Dark navy ===== */}
      <footer className="landing-footer">
        <div className="landing-section-inner">
          <div className="landing-footer-top">
            <div className="landing-footer-brand">
              <div className="landing-nav-logo-icon" style={{ width: '40px', height: '40px' }}>
                <CarFront size={20} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#fff' }}>Amroding General Merchandise</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '4px', lineHeight: '1.5' }}>
                  Distributing quality merchandise<br />with excellence and integrity across Mindanao.
                </div>
              </div>
            </div>
            <div className="landing-footer-links">
              <div className="landing-footer-col">
                <h5>Quick Links</h5>
                <a href="#about">About Us</a>
                <a href="#services">Products & Services</a>
                <a href="#why">Why Choose Us</a>
                <a href="#coverage">Coverage Area</a>
              </div>
              <div className="landing-footer-col">
                <h5>Contact Us</h5>
                <a href="#">(063) 123 4567</a>
                <a href="#">mail.amerhantbh@gmail.com</a>
                <a href="#">Lanao del Sur, Mindanao</a>
              </div>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <span>© {new Date().getFullYear()} Amroding General Merchandise. All Rights Reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
