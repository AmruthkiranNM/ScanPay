# ScanPay — Offline Digital Payment System

## Problem Statement

**Theme 3: FinTech & Financial Inclusion**
**Problem: Last-Mile Banking Without Internet**

Millions of people in rural and remote areas face unreliable or no internet connectivity, limiting access to digital financial services.

The challenge is to build a solution that enables financial transactions without continuous internet using methods such as:

* SMS / USSD
* Offline QR systems
* Bluetooth-based payments

### Goal

To make UPI-like payments accessible in low-connectivity environments and improve financial inclusion.

---

## Solution Overview

ScanPay is an offline-first digital payment system that enables seamless peer-to-peer transactions without requiring WiFi, mobile data, or hotspot connectivity.

The system uses offline QR-based payment exchange, allowing users to send and receive money even in zero-network conditions.

* Users complete a one-time online onboarding (OTP-based authentication)
* All subsequent transactions are performed completely offline
* Transactions are later synchronized and validated when connectivity is restored

---

## Key Features

* Internet-Free Transactions
  Perform payments without any network connection

* Secure One-Time OTP Authentication
  Ensures user identity during onboarding

* Offline QR Code-Based Payments
  Exchange payment data directly between devices

* Merchant-Specific Static QR Codes
  Enables offline payments at shops and vendors

* Instant Payment Experience
  Transactions appear instantly (pending confirmation)

* Peer-to-Peer Transactions
  Direct user-to-user payments

* USSD-Based Payment Simulation
  Supports feature-phone-like interaction models

---

## How It Works

### Transaction Flow

#### 1. Onboarding (Online — One Time)

* User registers using OTP
* Wallet is initialized

#### 2. Offline Payment

* Sender enters amount
* Generates QR code
* Receiver scans QR
* Transaction stored locally on both devices
* Status: Pending (Unverified)

#### 3. Sync and Validation (Online)

* App detects connectivity
* Pending transactions sent to server
* Server validates and updates balances

Final Status:

* Confirmed
* Failed (if conflict occurs)

---

## Wallet Model

ScanPay uses a prepaid wallet system:

* Users load money into wallet when online
* Offline transactions use wallet balance
* Final settlement happens after sync

---

## Security Approach

* Digital transaction signing
* Local balance locking (prevents overspending)
* Transaction limits to reduce risk
* Replay protection using unique transaction IDs
* Secure local storage

---

## Limitations

* Offline transactions are not immediately final
* Double spending cannot be fully prevented in offline mode
* Small transaction limits are enforced for safety
* Final validation requires internet sync

---

## Innovation and Impact

ScanPay directly addresses the challenge of last-mile banking without internet by enabling:

* Financial access in rural and remote areas
* Reliable transactions during network outages
* Inclusive and resilient digital payment systems

It bridges the gap between traditional cash systems and modern digital payments.

---

## Regulatory Note

This project is a prototype simulation.

Real-world deployment would require:

* Compliance with regulations from the Reserve Bank of India
* Prepaid Payment Instrument (PPI) licensing
* KYC and fraud prevention systems

---

## Demo Scenario

1. Two users onboard and load wallet
2. Internet is turned off
3. User A sends money via QR
4. User B receives payment (pending)
5. Internet is restored
6. Transactions sync and are confirmed

---

## Conclusion

ScanPay demonstrates that digital payments can function independently of internet connectivity, making financial services more inclusive, resilient, and accessible.

---

## Tech Stack

* Frontend: React + Vite (PWA)
* Backend: Node.js + Express
* Database: MongoDB
* Storage: IndexedDB
* Security: Web Crypto API
* QR: qrcode, html5-qrcode

