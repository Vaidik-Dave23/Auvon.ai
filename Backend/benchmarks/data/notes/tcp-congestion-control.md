## 📘 Domain Architectural Overview

TCP Congestion Control is a sophisticated set of algorithms implemented within the Transmission Control Protocol (TCP) to prevent network collapse due to excessive packet injection into the network, a phenomenon known as **congestion collapse**. Its primary objective is to dynamically adjust the rate at which a sender transmits data based on the perceived capacity of the intermediate network path, thereby maximizing network utilization and fairness while minimizing packet loss and latency.

The systemic problem it addresses is the fundamental mismatch between application layer demand for bandwidth and the finite capacity of the underlying network infrastructure. Without congestion control, senders would transmit data indiscriminately, leading to buffer overflows at routers, increased packet retransmissions, and a drastic reduction in effective throughput—a "tragedy of the commons" scenario where individual optimization leads to system-wide degradation.

TCP Congestion Control is critical for the stability and efficiency of the entire internet. It is implemented at **Layer 4 (Transport Layer)** of the OSI model, specifically within the TCP stack of every host (operating system kernel space) that uses TCP for communication. This includes virtually all internet-connected devices: servers, workstations, mobile phones, and IoT devices. Production implementations are found in operating systems like Linux (e.g., Cubic, BBR, Reno), Windows (e.g., NewReno, CTCP), macOS, and various networking devices.

## 🔑 Core Mechanics — Detailed Breakdown

### **Congestion Window (cwnd)**
Defines: A sender-side variable that limits the number of unacknowledged bytes (or segments) that can be in flight End-to-End. It is a critical component in the flow control loop, governing the rate at which new data can be transmitted. Its value is dynamically adjusted by congestion control algorithms.
Standard Declaration: `uint32_t cwnd; // Measured in bytes or segments`
Micro-use-case: If `cwnd = 4` segments and each segment is 1500 bytes, the sender can transmit up to 6000 bytes before requiring an acknowledgment for previously sent data.

### **Receiver Advertised Window (rwnd)**
Defines: A receiver-side variable communicated back to the sender, indicating the amount of available buffer space at the receiver. The sender's effective transmission window is the minimum of `cwnd` and `rwnd`, ensuring the receiver is not overwhelmed.
Standard Declaration: `uint32_t rwnd; // Measured in bytes`
Micro-use-case: If `rwnd = 10000` bytes, the sender cannot send more than 10000 bytes beyond the last acknowledged byte, even if `cwnd` allows for more. This prevents receiver buffer exhaustion.

### **Slow Start**
Defines: An initial phase of congestion control designed to rapidly determine the available network capacity without overwhelming it. It exponentially increases `cwnd` until a loss event occurs or `cwnd` reaches the **slow start threshold (ssthresh)**. For every Acknowledgement (ACK) received, `cwnd` is increased by approximately one Maximum Segment Size (MSS).
Standard Declaration: `cwnd = initial_cwnd; // Typically 2-10 MSS`
`ssthresh = initial_ssthresh; // Typically 65535 bytes or system default`
Micro-use-case: A new TCP connection starts with `cwnd = 3 * MSS`. If `MSS = 1500` bytes, `cwnd` is initially 4500 bytes. After receiving 3 ACKs, `cwnd` becomes `4500 + 3 * 1500 = 9000` bytes, then `9000 + 6 * 1500 = 18000` bytes after 6 more ACKs, demonstrating exponential growth.

### **Congestion Avoidance**
Defines: A phase that follows Slow Start (or Fast Recovery) where `cwnd` is increased linearly to probe for additional available bandwidth. For every Round-Trip Time (RTT), `cwnd` is increased by approximately one MSS. This slow, additive increase aims to find the network's capacity ceiling more cautiously.
Standard Declaration: `cwnd = cwnd + MSS * (MSS / cwnd); // For every ACK received (approx.)`
Micro-use-case: If `cwnd = 100 * MSS` and `MSS = 1500` bytes, after one RTT (assuming all segments in `cwnd` are ACKed), `cwnd` would increase to `101 * MSS`.

### **Fast Retransmit**
Defines: A mechanism to detect packet loss without waiting for a retransmission timeout (RTO). If a sender receives three duplicate ACKs for the same segment, it assumes the subsequent segment has been lost and immediately retransmits the presumed lost segment.
Standard Declaration: Event: `dup_acks_received >= 3`
Action: `retransmit_segment(seq_num_of_missing_segment)`
Micro-use-case: Sender sends segments 1, 2, 3, 4, 5. Receiver gets 1, 2, 4, 5. Receiver sends ACK for 2, then Duplicate ACK for 2 (upon receiving 4), then another Duplicate ACK for 2 (upon receiving 5). Upon receiving the third duplicate ACK for 2, the sender immediately retransmits segment 3.

### **Fast Recovery**
Defines: A phase initiated after Fast Retransmit, aimed at recovering from packet loss while maintaining high throughput. `ssthresh` is typically set to `cwnd / 2`, and `cwnd` is set to `ssthresh + 3 * MSS` (for the 3 duplicate ACKs that triggered it). `cwnd` then increases by 1 MSS for each additional duplicate ACK until the retransmitted segment is acknowledged (a new ACK). After the new ACK, `cwnd` is set to `ssthresh` and Congestion Avoidance resumes.
Standard Declaration:
`ssthresh = cwnd / 2;`
`cwnd = ssthresh + 3 * MSS;`
Micro-use-case: Upon detecting loss via Fast Retransmit, if `cwnd = 100 * MSS`, then `ssthresh` becomes `50 * MSS`. `cwnd` immediately jumps to `50 * MSS + 3 * MSS = 53 * MSS`. For every subsequent duplicate ACK, `cwnd` increases by `MSS`. Once the lost segment (retransmitted) is ACKed, `cwnd` is set to `50 * MSS`, and Congestion Avoidance begins.

### **Retransmission Timeout (RTO)**
Defines: A timer set for each transmitted segment. If an ACK for a segment is not received before its RTO expires, the segment is considered lost, retransmitted, and `ssthresh` is typically set to `cwnd / 2` (minimum 2 MSS), `cwnd` is reset to 1 MSS, and Slow Start begins. RTO is dynamically calculated using smoothed RTT (SRTT) and RTT variation (RTTVAR) measurements.
Standard Declaration:
$$
\begin{align*}
SRTT &\leftarrow (1 - \alpha) \cdot SRTT + \alpha \cdot RTT \\
RTTVAR &\leftarrow (1 - \beta) \cdot RTTVAR + \beta \cdot |RTT - SRTT| \\
RTO &= SRTT + 4 \cdot RTTVAR
\end{align*}
$$
Where $\alpha=1/8$, $\beta=1/4$ as per RFC 6298.
Micro-use-case: A segment is sent with an RTO of 500 ms. If no ACK is received within 500 ms, the sender retransmits the segment, sets `ssthresh = cwnd / 2`, and `cwnd = 1 MSS`, entering Slow Start.

## 💻 Practical Code Implementations

### 1. TCP Reno Congestion Window Update Logic (Simplified)

This snippet illustrates the core `cwnd` adjustments in TCP Reno during Slow Start, Congestion Avoidance, and on loss detection (via Fast Retransmit/Fast Recovery or RTO).

```c
// Assume MSS, cwnd, ssthresh, rtt_samples are global or struct members
// Assume initial_cwnd = 4 * MSS, initial_ssthresh = 65535 (or high value)

enum CongestionState {
    SLOW_START,
    CONGESTION_AVOIDANCE,
    FAST_RECOVERY
};

CongestionState current_state = SLOW_START;
uint32_t cwnd = 4 * MSS;         // Congestion Window in bytes
uint32_t ssthresh = 65535;      // Slow Start Threshold in bytes
uint32_t dup_acks_count = 0;     // Counter for duplicate ACKs

// Function called upon receiving a new ACK (acknowledging new data)
void on_ack_received(uint33_t acked_bytes) {
    if (current_state == SLOW_START) {
        cwnd += acked_bytes; // Approximately 1 MSS for each ACK
        if (cwnd >= ssthresh) {
            current_state = CONGESTION_AVOIDANCE;
        }
    } else if (current_state == CONGESTION_AVOIDANCE) {
        // Additive increase: cwnd += MSS * (MSS / cwnd) for each ACK
        // Simplified: increase by 1 MSS per RTT. If acked_bytes represents 1 MSS:
        cwnd += (MSS * MSS) / cwnd; // Increment is less than MSS for high cwnd
        // A more precise "per RTT" implementation would count ACKs within an RTT
    } else if (current_state == FAST_RECOVERY) {
        // Exit Fast Recovery after receiving an ACK for the retransmitted segment
        current_state = CONGESTION_AVOIDANCE;
        cwnd = ssthresh; // Set cwnd to ssthresh
    }
    dup_acks_count = 0; // Reset duplicate ACK counter on new ACK
}

// Function called upon receiving a duplicate ACK
void on_duplicate_ack(uint32_t seq_num_of_missing) {
    dup_acks_count++;
    if (dup_acks_count == 3) { // Three duplicate ACKs -> Fast Retransmit
        ssthresh = cwnd / 2;
        if (ssthresh < 2 * MSS) ssthresh = 2 * MSS; // Minimum ssthresh
        
        cwnd = ssthresh + 3 * MSS; // Set cwnd for Fast Recovery
        current_state = FAST_RECOVERY;
        retransmit_segment(seq_num_of_missing); // Immediately retransmit
    } else if (current_state == FAST_RECOVERY) {
        // Inflate cwnd during Fast Recovery for subsequent duplicate ACKs
        cwnd += MSS;
    }
}

// Function called upon Retransmission Timeout (RTO)
void on_rto_timeout() {
    ssthresh = cwnd / 2;
    if (ssthresh < 2 * MSS) ssthresh = 2 * MSS; // Minimum ssthresh
    
    cwnd = 1 * MSS; // Reset cwnd to 1 MSS
    current_state = SLOW_START; // Enter Slow Start
    retransmit_last_unacked_segment(); // Retransmit segment
    dup_acks_count = 0; // Reset duplicate ACK counter
}

// Helper: retransmit_segment(seq_num)
// Helper: retransmit_last_unacked_segment() - for RTO
```

### 2. RTO Calculation (Jacobson/Karels Algorithm)

This C-like pseudocode implements the standard RTO calculation as per RFC 6298.

```c
// Assume initial RTO, SRTT, RTTVAR are set on connection establishment
// E.g., RTO = 1 second, SRTT = 0, RTTVAR = 0
// G = clock granularity (e.g., 1ms, 10ms)
// K = 4, Alpha = 1/8, Beta = 1/4 (standard values)

long srtt = 0;         // Smoothed Round-Trip Time (microseconds)
long rttvar = 0;       // RTT Variation (microseconds)
long rto = 1000000;    // Retransmission Timeout (microseconds, default 1s)
long min_rto = 200000; // Minimum RTO (e.g., 200ms)
long max_rto = 60000000; // Maximum RTO (e.g., 60s)
bool first_rtt_sample = true;

// Function called when a new RTT sample is available (e.g., from an ACK)
void update_rto(long new_rtt_sample) { // new_rtt_sample in microseconds
    if (first_rtt_sample) {
        srtt = new_rtt_sample;
        rttvar = new_rtt_sample / 2; // Initial RTTVAR = SRTT/2
        first_rtt_sample = false;
    } else {
        long diff = new_rtt_sample - srtt;
        if (diff < 0) diff = -diff; // Absolute difference

        // RTTVAR update: RTTVAR = (1-B)*RTTVAR + B*|RTT - SRTT|
        rttvar = (rttvar * 3 + diff) / 4; // Beta = 1/4 -> (1-1/4) = 3/4

        // SRTT update: SRTT = (1-A)*SRTT + A*RTT
        srtt = (srtt * 7 + new_rtt_sample) / 8; // Alpha = 1/8 -> (1-1/8) = 7/8
    }

    // RTO = SRTT + K*RTTVAR
    rto = srtt + (rttvar * 4); // K = 4

    // Ensure RTO is within bounds
    if (rto < min_rto) {
        rto = min_rto;
    }
    if (rto > max_rto) {
        rto = max_rto;
    }
    
    // RTO must be at least one clock granularity (G) if using system timer ticks
    // For general purpose, min_rto covers this.
}
```

## 📊 Comparative Analysis & Trade-offs

| Feature / Algorithm | TCP Reno                                   | TCP NewReno                                | TCP SACK (Selective ACK)                   | TCP Cubic (Linux Default)                  | TCP BBR (Bottleneck Bandwidth and RTT)        |
|:--------------------|:-------------------------------------------|:-------------------------------------------|:-------------------------------------------|:-------------------------------------------|:----------------------------------------------|
| **Core Philosophy** | Loss-based, aims to keep pipe full         | Loss-based, better handles multiple losses | Loss-based, handles multiple losses efficiently | Loss-based, fairness-driven, high bandwidth | Delay-based, aims for bottleneck rate, low queue |
| **Loss Detection**  | 3 Dup ACKs (Fast Retransmit), RTO          | 3 Dup ACKs (Fast Retransmit), RTO          | 3 Dup ACKs (Fast Retransmit), RTO, SACK blocks | 3 Dup ACKs (Fast Retransmit), RTO          | Explicit congestion notification (ECN), RTO, RTT spikes |
| **Fast Recovery**   | `cwnd = ssthresh + 3*MSS`, then `cwnd += MSS` per Dup ACK; on New ACK, `cwnd = ssthresh` | Same as Reno, but stays in FR for entire "recovery episode" until all missing data prior to FR is ACKed | Uses SACK blocks to know *exactly* which segments are missing, retransmits only those. `cwnd` adjusted based on SACK. | Similar to NewReno, but `cwnd` recovery shaped by cubic function. | N/A (different rate control mechanism)      |
| **`cwnd` Increase** | Slow Start: Exponential; CA: Additive (+1 MSS/RTT) | Same as Reno                               | Same as Reno/NewReno                       | Slow Start: Exponential; CA: Cubic function (aggressive growth, then plateau) | Not directly `cwnd` based. Instead, controls pacing rate based on RTT and bandwidth samples. `cwnd` is derived. |
| **`cwnd` Decrease** | On 3 Dup ACKs: `ssthresh = cwnd/2`, `cwnd = ssthresh + 3*MSS`; On RTO: `ssthresh = cwnd/2`, `cwnd = 1 MSS` | Same as Reno                               | Similar to Reno/NewReno but more accurate due to SACK. | On 3 Dup ACKs: `ssthresh = cwnd_at_loss * 0.8`, `cwnd = ssthresh`; On RTO: `ssthresh = cwnd/2`, `cwnd = 1 MSS` | Rate reduced when RTT increases/bandwidth estimate drops. |
| **Throughput**      | Moderate                                   | Moderate-High (better for burst losses)    | High (especially with multiple losses)     | Very High (especially on high-BDP links)   | Very High (aims for optimal BDP, low latency) |
| **Fairness**        | Good (competes fairly with other Reno flows) | Good                                       | Good                                       | High (can be aggressive, but yields to old flows) | Good (aims to share bottleneck bandwidth fairly) |
| **Latency**         | Can be high due to queue buildup           | Can be high due to queue buildup           | Can be high due to queue buildup           | Can be high due to queue buildup           | Low (aims to keep queue empty, probes for bandwidth without filling buffers) |
| **Best Use Case**   | General-purpose, older networks            | General-purpose, handles multiple losses well | Networks where SACK is supported, critical for high-loss environments | High-speed, long-distance networks (high BDP) | Any network, especially high-BDP, low-loss, or satellite links where latency is critical. |
| **Limitations**     | Prone to "ACK compression" issues; struggles with burst losses | Still struggles with pathologically ordered ACKs | Requires SACK support from receiver        | Can be overly aggressive, leading to temporary congestion | Performance sensitive to accurate BDP/RTT estimation; can sometimes struggle with highly fluctuating paths. |

## ⚡ Performance Cheatsheet

*   **Slow Start (SS) Growth:** Exponential. `cwnd` increases by `MSS` for every ACK. Thus, `cwnd` doubles approximately every RTT.
    $$
    cwnd_{k+1} \approx 2 \cdot cwnd_k
    $$
*   **Congestion Avoidance (CA) Growth:** Linear/Additive Increase. `cwnd` increases by approximately `MSS` per RTT.
    $$
    cwnd_{k+1} = cwnd_k + \frac{MSS^2}{cwnd_k} \quad \text{(per ACK)}
    $$
    $$
    cwnd_{k+1} \approx cwnd_k + MSS \quad \text{(per RTT)}
    $$
*   **Time Complexity of Congestion Detection (RTO vs. Fast Retransmit):**
    *   **Fast Retransmit:** $O(1)$ additional RTTs for loss detection after the packet is lost. (Detects loss faster than RTO).
    *   **RTO:** $O(RTO)$ time for loss detection, which can be several RTTs.
*   **Bandwidth Delay Product (BDP):** The theoretical maximum amount of data that can be in flight on a network path.
    $$
    BDP = \text{Bandwidth (bits/second)} \times \text{RTT (seconds)}
    $$
    TCP Congestion Control (especially Cubic, BBR) aims to have `cwnd` approach `BDP`.
*   **TCP Reno Throughput $\Theta$:** For a given loss rate $p$ and MSS $S$ (bytes), the approximate throughput ($T$) is inversely proportional to the square root of $p$ and proportional to MSS and RTT.
    $$
    T \approx \frac{MSS}{RTT \sqrt{2p/3}}
    $$
    This formula highlights that throughput drops significantly with increased loss.
*   **RTO Calculation (Jacobson/Karels):** Uses EWMA (Exponentially Weighted Moving Average) for SRTT and RTTVAR.
    *   $\alpha = 1/8$, $\beta = 1/4$ (RFC 6298).
    *   Minimum RTO: Typically $200 \text{ms}$. Maximum RTO: Typically $60 \text{s}$.
*   **Fairness (TCP Reno):** Two concurrent Reno flows sharing a bottleneck will eventually converge to roughly equal `cwnd` values due to synchronous loss events halving their windows.
*   **Congestion Collapse:** $\Theta(\text{effective throughput}) \rightarrow 0$ as $\text{number of senders} \rightarrow \infty$ without control. TCP Congestion Control prevents this by reducing injection rate.

## 🎯 Must-Know Summary

*   TCP Congestion Control prevents **congestion collapse** by dynamically adjusting the sender's transmission rate.
*   It operates by manipulating the **Congestion Window (cwnd)**, which limits inflight data.
*   **Slow Start** exponentially increases `cwnd` until `ssthresh` or loss, then **Congestion Avoidance** linearly increases `cwnd`.
*   **Fast Retransmit** (3 duplicate ACKs) and **Fast Recovery** mitigate single packet losses without a full RTO.
*   A **Retransmission Timeout (RTO)** triggers a drastic `cwnd` reduction (`1 MSS`) and resets to Slow Start.
*   Algorithms like **Cubic** and **BBR** improve performance over **Reno** by optimizing for high-BDP links or actively probing for bottleneck bandwidth and RTT.