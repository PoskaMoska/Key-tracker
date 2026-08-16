#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <DHT.h>

#define DHTPIN 15
#define DHTTYPE DHT22
#define MIC_PIN 34
#define SMOKE_PIN 32
#define LIGHT_PIN 33
#define LED_PIN 22
#define BUZZER_PIN 21

DHT dht(DHTPIN, DHTTYPE);

uint8_t gatewayAddress[] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x01};

typedef struct struct_message {
  int tower_id;
  float temp;
  int frequency;
  int smoke;
  int light;
  bool is_fire;
  bool is_chainsaw;
} struct_message;

struct_message myData;
const int TOWER_ID = 1;

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "[+] Nadislano" : "[-] Pomylka dostavky");
}

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  dht.begin();

  WiFi.mode(WIFI_STA);
  delay(50);

  Serial.print("\n=== VEZHA No "); Serial.print(TOWER_ID); Serial.println(" ZAPUShchENA ===");

  if (esp_now_init() != ESP_OK) {
    Serial.println("Pomylka ESP-NOW");
    return;
  }

  esp_now_register_send_cb(OnDataSent);

  esp_now_peer_info_t peerInfo;
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, gatewayAddress, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Pomylka reestraciyi shlyuzu");
  }

  myData.tower_id = TOWER_ID;
}

void loop() {
  float t = dht.readTemperature();
  int raw_audio = analogRead(MIC_PIN);
  int raw_smoke = analogRead(SMOKE_PIN);
  int raw_light = analogRead(LIGHT_PIN);

  myData.temp = isnan(t) ? 24.0 : t;
  myData.frequency = map(raw_audio, 0, 4095, 0, 3000);
  myData.smoke = map(raw_smoke, 0, 4095, 0, 100);
  myData.light = map(raw_light, 0, 4095, 0, 100);

  myData.is_fire = (myData.temp > 45.0) || (myData.smoke > 50);
  myData.is_chainsaw = (myData.frequency >= 80 && myData.frequency <= 250);

  bool alarm = myData.is_fire || myData.is_chainsaw;
  digitalWrite(LED_PIN, alarm ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, alarm ? HIGH : LOW);

  Serial.print("Vezha 1 -> T: "); Serial.print(myData.temp, 1);
  Serial.print("C | Zvuk: "); Serial.print(myData.frequency);
  Serial.print("Gts | Dym: "); Serial.print(myData.smoke);
  Serial.print("% | Svitlo: "); Serial.print(myData.light);
  Serial.print("% | Status: ");
  Serial.println(alarm ? "TRYVOGA" : "NORMA");

  esp_now_send(gatewayAddress, (uint8_t *)&myData, sizeof(myData));

  delay(3000);
}
