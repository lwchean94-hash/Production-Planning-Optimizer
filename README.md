<div align="center">
<img width="1200" height="475" alt="GHBanner" src="./public/banner.png" />
</div>

# NGC Scheduler - Production Planning Optimizer

The **NGC Scheduler - Production Planning Optimizer** is a high-performance, browser-based Production Scheduling Application designed for a continuous glove manufacturing plant. It uses an advanced **Least-Cost Insertion Heuristic** to automatically assign factory orders to production lines, minimizing changeover penalties and maximizing throughput.

## 🚀 Key Features

*   **Dynamic Combinatorial Heuristic:** Automatically evaluates incoming orders, combining compatible orders (same product, varying sizes) across the 4 physical tiers of a production line.
*   **Setup Penalty Minimization:** Calculates exact downtime penalties for Product Changeovers (Chemical Flush) and Size Changes (Former Swaps) via specific, configurable matrices.
*   **Constraints & Plant Affinity:** Orders can be explicitly targeted to specific plants or lines, ensuring they are only scheduled where compatible.
*   **Fixed Activities Handling:** Master schedule insertions respect existing fixed line activities (like maintenance), safely shifting scheduled production around them without creating overlapping conflicts.
*   **Manual Boundary Overrides:** Users can manually lock an order and set a specific start or end time. The engine automatically calculates the corresponding missing boundary based on line speed, active tier ratios, and requested quantity.
*   **Bulk Excel/CSV Integration:** Easily import large batches of orders and activities via CSV/Excel, and export the generated Master Schedule.

## 🏗️ Architecture

This application is fully **serverless**, operating entirely as a static HTML + vanilla JavaScript client application. 
*   **No Backend Required:** It runs perfectly over the `file://` protocol.
*   **State Management:** All data (orders, activities, matrices, generated schedules) is securely stored within the browser's `localStorage` API.
*   **Highly Optimized Engine:** The core algorithm (`app.js`) is heavily optimized using pre-computed constraint maps and search bounding, allowing it to process thousands of orders locally in the browser.

## 💻 How to Run (Application)

Because it is purely static, there are no dependencies to install to use the application.

1.  Clone or download the repository.
2.  Double-click `index.html` to open it in any modern web browser (Chrome, Edge, Firefox, etc.).
3.  Navigate through the Dashboard, Master Schedule, and Settings tabs to configure and generate your schedules.

## 🛠️ Development & Testing

While the application itself runs in the browser, Node.js is required to run the automated benchmarking and testing suites.

**Prerequisites:** [Node.js](https://nodejs.org/) (v18+ recommended).

1.  **Run Smoke Tests:**
    Validates core heuristic constraints, penalty math, combinations, and edge-case boundaries.
    ```bash
    node optimizer-smoke-test.cjs
    ```

2.  **Run Performance Benchmarks:**
    Runs deterministic large-scale datasets (100 to 2000+ orders) through the scheduling engine to measure completion time and complexity scaling.
    ```bash
    node optimizer-benchmark.cjs
    ```

## 📄 License
Copyright © Hartalega Holdings Berhad. All Rights Reserved.
