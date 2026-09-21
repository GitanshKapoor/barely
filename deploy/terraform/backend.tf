terraform {
  backend "s3" {
    bucket       = "<bucket-name>"
    key          = "prod/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true 
  }
}