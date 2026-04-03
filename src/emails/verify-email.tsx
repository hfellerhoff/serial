import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from "@react-email/components";

interface VerifyEmailProps {
  otp?: string;
}

const baseUrl = `https://serial.tube`;

export default function VerifyEmailEmail({ otp }: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your verification code for Serial</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Verify your email</Heading>
          <Text style={text}>
            Enter the following code to verify your email address:
          </Text>
          <Text style={code}>{otp}</Text>
          <Text
            style={{
              ...text,
              color: "#ababab",
              marginTop: "14px",
              marginBottom: "16px",
            }}
          >
            If you didn&apos;t request this code, you can safely ignore this
            email.
          </Text>

          <Img
            style={{
              marginTop: 32,
            }}
            src={`${baseUrl}/icon-256.png`}
            width="48"
            height="48"
            alt="Serial's Logo"
          />
          <Text
            style={{
              ...text,
              color: "#666",
              marginTop: "14px",
              marginBottom: "16px",
            }}
          >
            Having trouble? Reach out to us at{" "}
            <Link
              style={{
                textDecoration: "underline",
              }}
              href="mailto:hey@serial.tube?subject=Question%20about%20serial.tube"
            >
              hey@serial.tube
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#ffffff",
};

const container = {
  paddingLeft: "12px",
  paddingRight: "12px",
  margin: "0 auto",
} as const;

const h1 = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "24px",
  fontWeight: "bold",
  marginTop: "40px",
  marginBottom: "20px",
  padding: "0",
};

const code = {
  color: "#333",
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: "36px",
  fontWeight: "bold",
  letterSpacing: "8px",
  textAlign: "center" as const,
  margin: "24px 0",
};

const text = {
  color: "#333",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  fontSize: "14px",
  margin: "24px 0",
};
